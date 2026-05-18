# Repo Agent Handoff: Prediction Markets Cross-Asset Data Pipeline
**Project:** Prediction Markets as Cross-Asset Sentiment Signals
**Owner:** Chris Ongko | Molina-Optiplex
**Status:** Data collection phase — pre-analysis
**Date:** May 2026

---

## Objective

Build a complete data pipeline that:
1. Scrapes the full historical contract universe from Polymarket and Kalshi
2. Categorizes contracts by topic type
3. Matches each contract to its most relevant financial asset or sector
4. Pulls corresponding asset price/return data at daily frequency
5. Outputs a clean panel dataset ready for regression analysis

The output feeds an academic paper testing whether prediction market implied probability changes predict corresponding financial asset returns across multiple asset classes.

---

## Part 1: Polymarket Data Collection

### 1A. Markets Catalogue (Gamma API)

**Endpoint:** `https://gamma-api.polymarket.com/markets`
**Auth:** None required for read operations
**Method:** GET with pagination

```python
import requests, time, json

BASE = "https://gamma-api.polymarket.com"

def fetch_all_markets():
    markets = []
    offset = 0
    limit = 100
    while True:
        r = requests.get(f"{BASE}/markets",
            params={"limit": limit, "offset": offset, "closed": "true"},
            timeout=15)
        batch = r.json()
        if not batch:
            break
        markets.extend(batch)
        offset += limit
        time.sleep(0.3)  # rate limit courtesy
    return markets
```

**Fields to capture per market:**
- `conditionId` — unique identifier, use as primary key
- `question` — full question text (used for categorization)
- `description` — additional context
- `startDate`, `endDate` — contract window
- `volume` — total USDC traded (liquidity filter)
- `liquidity` — current open interest
- `outcomePrices` — current YES/NO prices
- `outcomes` — ["Yes", "No"]
- `active`, `closed`, `resolved` — status flags
- `resolvedAt`, `resolutionValue`

**Also fetch active markets** (remove `closed: true`) to get ongoing contracts.

### 1B. Historical Probability Series (CLOB API)

For each market that passes liquidity filter, pull the daily closing price series.

**Endpoint:** `https://clob.polymarket.com/prices-history`
**Auth:** None for public price history

```python
def fetch_price_history(condition_id, start_ts, end_ts):
    r = requests.get("https://clob.polymarket.com/prices-history",
        params={
            "market": condition_id,
            "startTs": start_ts,
            "endTs": end_ts,
            "fidelity": 1440,  # daily (minutes)
        },
        timeout=15)
    return r.json()  # returns {history: [{t: unix_ts, p: float}, ...]}
```

**Fallback — Gamma API timeseries:**
```python
def fetch_gamma_prices(condition_id):
    r = requests.get(f"{BASE}/markets/{condition_id}/prices-history",
        params={"interval": "1d"},
        timeout=15)
    return r.json()
```

### 1C. Liquidity Filter

Only include markets where:
- `volume` > 50,000 USDC (minimum $50k traded)
- Contract duration > 7 days
- Has at least 30 daily price observations

This should yield approximately 2,000–5,000 usable contracts from the full universe.

---

## Part 2: Kalshi Data Collection

**Base URL:** `https://trading-api.kalshi.com/trade-api/v2`
**Auth:** None for read-only market data

### 2A. Markets Catalogue

```python
def fetch_kalshi_markets():
    markets = []
    cursor = None
    while True:
        params = {"limit": 100, "status": "finalized"}
        if cursor:
            params["cursor"] = cursor
        r = requests.get(
            "https://trading-api.kalshi.com/trade-api/v2/markets",
            params=params, timeout=15)
        data = r.json()
        markets.extend(data.get("markets", []))
        cursor = data.get("cursor")
        if not cursor:
            break
        time.sleep(0.3)
    return markets
```

**Fields to capture:**
- `ticker` — primary key
- `title` — question text
- `category` — Kalshi's own categorization (useful baseline)
- `open_time`, `close_time`
- `volume` — total contracts traded
- `result` — Yes/No resolution
- `yes_ask`, `no_ask` — current prices

### 2B. Historical Candlestick Data

```python
def fetch_kalshi_history(ticker):
    r = requests.get(
        f"https://trading-api.kalshi.com/trade-api/v2/markets/{ticker}/candlesticks",
        params={"period_interval": 1440},  # daily
        timeout=15)
    return r.json()  # {candlesticks: [{ts, open, high, low, close, volume}]}
```

---

## Part 3: Contract Categorization

### 3A. Taxonomy

Assign each contract to exactly one of these categories using keyword matching + LLM classification:

| Category | Code | Description | Example Assets |
|---|---|---|---|
| Macro — Fed Policy | `MACRO_FED` | Rate decisions, FOMC | S&P500, TLT, 2Y yield |
| Macro — Inflation | `MACRO_CPI` | CPI, PCE, inflation | TIPS, gold, sector rotation |
| Macro — Growth | `MACRO_GDP` | GDP, recession, unemployment | Cyclicals vs defensives |
| Political — US | `POL_US` | Elections, legislation, executive | Sector ETFs, DJT |
| Political — Geopolitical | `POL_GEO` | Wars, sanctions, trade | Oil, defense, gold |
| Regulatory — Crypto | `REG_CRYPTO` | SEC actions, ETF approvals | BTC, ETH, SOL |
| Regulatory — Sector | `REG_SECTOR` | Antitrust, pharma, AI policy | Relevant sector ETFs |
| Corporate | `CORP` | M&A outcomes, earnings, CEO | Individual stocks |
| Tariff/Trade | `TRADE` | Tariff rates, trade deals | Import sectors, DXY |
| Crypto Price | `CRYPTO_PRICE` | Direct price prediction | BTC, ETH, altcoins |

### 3B. Categorization Script

```python
# Step 1: keyword pre-filter (fast, handles ~70%)
KEYWORDS = {
    "MACRO_FED": ["fed", "fomc", "federal reserve", "rate cut", "rate hike",
                  "basis points", "interest rate", "powell"],
    "MACRO_CPI": ["cpi", "inflation", "pce", "consumer price", "core inflation"],
    "MACRO_GDP": ["gdp", "recession", "unemployment", "jobs report", "nonfarm"],
    "POL_US":    ["election", "president", "congress", "senate", "legislation",
                  "bill", "act", "trump", "biden", "harris"],
    "POL_GEO":   ["war", "ukraine", "russia", "china", "taiwan", "iran",
                  "sanctions", "nato", "ceasefire", "conflict"],
    "REG_CRYPTO":["sec", "etf", "bitcoin etf", "ethereum etf", "crypto regulation",
                  "clarity act", "fit21", "cftc", "ripple", "coinbase"],
    "REG_SECTOR":["antitrust", "fda", "drug approval", "ai regulation",
                  "google", "meta", "amazon", "doj"],
    "CORP":      ["earnings", "acquisition", "merger", "ceo", "bankruptcy",
                  "buyout", "ipo", "quarterly"],
    "TRADE":     ["tariff", "trade war", "trade deal", "import", "export",
                  "customs", "wto"],
    "CRYPTO_PRICE": ["bitcoin above", "btc above", "eth above", "price",
                     "will bitcoin", "will ethereum"],
}

# Step 2: LLM classification for ambiguous cases (~30%)
# Use Fleet/Claude API with structured output
CLASSIFY_PROMPT = """
Classify this prediction market contract into exactly one category.
Contract: {question}
Categories: MACRO_FED, MACRO_CPI, MACRO_GDP, POL_US, POL_GEO,
            REG_CRYPTO, REG_SECTOR, CORP, TRADE, CRYPTO_PRICE, OTHER
Return only the category code.
"""
```

---

## Part 4: Asset Matching

### 4A. Matching Logic

For each contract category, map to the primary asset(s) to track:

```python
CATEGORY_ASSET_MAP = {
    "MACRO_FED": {
        "assets": ["^TNX", "^IRX", "TLT", "^GSPC", "GLD"],
        "primary": "^TNX",  # 10Y Treasury yield
        "rationale": "Fed decisions directly price into yields"
    },
    "MACRO_CPI": {
        "assets": ["GLD", "TIP", "^GSPC", "DX-Y.NYB"],
        "primary": "GLD",
        "rationale": "Inflation surprises drive gold and TIPS"
    },
    "MACRO_GDP": {
        "assets": ["^GSPC", "XLY", "XLP", "HYG"],
        "primary": "^GSPC",
        "rationale": "Growth shocks affect broad equity"
    },
    "POL_US": {
        "assets": ["^GSPC", "XLE", "XLV", "XLF", "DJT"],
        "primary": "^GSPC",
        "rationale": "Policy uncertainty prices into broad market"
    },
    "POL_GEO": {
        "assets": ["CL=F", "GLD", "ITA", "^VIX"],
        "primary": "CL=F",  # Crude oil futures
        "rationale": "Geopolitical risk drives energy and safe havens"
    },
    "REG_CRYPTO": {
        "assets": ["BTC-USD", "ETH-USD", "SOL-USD"],
        "primary": "BTC-USD",
        "rationale": "Crypto regulatory events price into BTC first"
    },
    "REG_SECTOR": {
        "assets": ["XLK", "XLV", "META", "GOOGL", "AMZN"],
        "primary": "XLK",  # context-dependent, override per contract
        "rationale": "Sector-specific regulation affects relevant ETF"
    },
    "CORP": {
        "assets": [],  # populated per-contract from company name extraction
        "primary": None,
        "rationale": "Match to specific ticker from question text"
    },
    "TRADE": {
        "assets": ["XLI", "XLY", "DX-Y.NYB", "^GSPC"],
        "primary": "XLI",  # Industrials
        "rationale": "Tariffs hit import-intensive sectors"
    },
    "CRYPTO_PRICE": {
        "assets": ["BTC-USD", "ETH-USD"],
        "primary": "BTC-USD",
        "rationale": "Direct price contracts"
    },
}
```

### 4B. Asset Price Data

Use `yfinance` for all traditional assets, Binance API for crypto:

```python
import yfinance as yf

def fetch_asset_returns(ticker, start, end):
    df = yf.download(ticker, start=start, end=end, progress=False)
    df["log_ret"] = (df["Close"] / df["Close"].shift(1)).apply(np.log)
    return df[["Close", "log_ret"]]

# For crypto - Binance public API (no key)
def fetch_binance_ohlcv(symbol, start_ms, end_ms, interval="1d"):
    url = "https://api.binance.com/api/v3/klines"
    r = requests.get(url, params={
        "symbol": symbol, "interval": interval,
        "startTime": start_ms, "endTime": end_ms, "limit": 1000
    })
    return r.json()  # [[open_time, open, high, low, close, volume, ...]]
```

---

## Part 5: Panel Construction

### 5A. Output Schema

Final panel dataset: one row per (contract × date) observation.

```
contract_id       | str  — Polymarket conditionId or Kalshi ticker
platform          | str  — "polymarket" | "kalshi"
category          | str  — taxonomy code
date              | date — calendar date
prob_yes          | float — implied probability of Yes outcome [0,1]
delta_prob        | float — daily change in prob_yes
asset_ticker      | str  — matched financial asset
asset_return      | float — log return of asset on same day
asset_return_1d   | float — log return t+1 (forward)
asset_return_5d   | float — log return t+1 to t+5 (weekly forward)
volume_usd        | float — prediction market volume on date
contract_duration | int  — total days the contract was open
days_to_expiry    | int  — days remaining until resolution
resolved_yes      | bool — final outcome
```

### 5B. Filters Before Analysis

Apply these filters to the raw panel:
- Drop rows where `volume_usd` < 1,000 on that date (noise)
- Drop contracts shorter than 7 days total
- Drop category `CRYPTO_PRICE` from main analysis (endogenous)
- Flag and exclude dates identified as high wash-trading (Oct–Dec 2024)
  per Sirolly et al. (2025) — Polymarket only
- Winsorize `delta_prob` at 1st/99th percentile

### 5C. Estimated Dataset Size

| Category | Est. Contracts | Est. Contract-Days |
|---|---|---|
| MACRO_FED | 80–120 | 4,000–8,000 |
| MACRO_CPI | 40–60 | 2,000–4,000 |
| MACRO_GDP | 30–50 | 1,500–3,000 |
| POL_US | 200–400 | 15,000–30,000 |
| POL_GEO | 100–200 | 8,000–15,000 |
| REG_CRYPTO | 50–100 | 3,000–6,000 |
| REG_SECTOR | 40–80 | 2,000–5,000 |
| CORP | 100–300 | 5,000–15,000 |
| TRADE | 30–80 | 2,000–5,000 |
| **Total** | **~1,000–1,500** | **~50,000–90,000** |

---

## Part 6: Output Files Required

```
/data/raw/
    polymarket_markets_catalogue.parquet
    polymarket_price_history.parquet      # long format: conditionId, date, prob
    kalshi_markets_catalogue.parquet
    kalshi_price_history.parquet

/data/processed/
    contracts_categorized.parquet         # with category, asset match
    panel_full.parquet                    # full contract×date panel
    panel_filtered.parquet                # after liquidity/wash-trade filters
    asset_returns.parquet                 # all asset return series

/data/summary/
    contract_counts_by_category.csv
    liquidity_distribution.csv
    coverage_dates.csv
```

---

## Known Issues / Watch Points

1. **Wash trading flag:** Sirolly et al. (2025) found ~25% of Polymarket volume was artificial, peaking at ~60% in Dec 2024. Add a `wash_trade_flag` boolean column. Flag: Oct–Dec 2024, high-volume contracts on Polymarket. Run regressions with and without flagged dates.

2. **Kalshi liquidity:** Kalshi only hit real scale in 2024. Pre-2024 Kalshi contracts are thin and should be treated with caution. Consider restricting Kalshi sample to Jan 2024 onwards.

3. **CORP contracts:** Company name → ticker matching requires a fuzzy lookup against a ticker database. Use `thefuzz` or similar. Flag low-confidence matches for manual review.

4. **Probability near 0 or 1:** Delta_prob is very small near resolution. Consider dropping observations within 3 days of expiry or using a logit transform on the probability level.

5. **Multiple contracts per event:** Some events have multiple overlapping contracts (e.g., "Fed cuts by 25bp" and "Fed cuts by 50bp" for same meeting). Deduplicate or keep only the most liquid per event.

---

## Dependencies

```
requests
pandas
numpy
pyarrow
yfinance
thefuzz
py-clob-client
tqdm
```

---

## Questions for Chris Before Execution

- Should CRYPTO_PRICE contracts be kept as a separate robustness sub-panel or dropped entirely?
- For CORP contracts, restrict to S&P500 constituents only, or cast wider?
- Kalshi vs Polymarket: run separately then pool, or pool from the start?
- Time window: 2021–2026 full history, or restrict to 2023–2026 for better liquidity?