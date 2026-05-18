# Paper Draft: Prediction Markets as Cross-Asset Sentiment Infrastructure
**Working Title:** "Information Finance: Prediction Market Implied Probabilities as Cross-Asset Sentiment Signals"
**Author:** Chris Ongko | Yuan Ze University, Graduate School of Finance
**Status:** Idea documentation — pre-data, pre-analysis
**Date:** May 2026
**Portfolio Role:** Standalone working paper, Molina-Optiplex research portfolio

---

## 1. The Core Idea in Plain Language

Prediction markets are not really gambling platforms. They are distributed probability estimation engines where participants stake money on whether specific real-world claims will resolve true. Every contract is a structured news claim with a probability price — "Will the Fed cut rates in September?" priced at 0.72 means the market collectively believes there is a 72% chance that claim is true. Unlike news articles, opinion polls, or analyst forecasts, this price is incentive-compatible: participants bear the financial cost of being wrong, which disciplines noise and forces genuine belief expression.

If prediction market prices measure real beliefs about real-world events that affect financial assets, then changes in those prices should predict — or at minimum co-move with — changes in corresponding asset returns. A shift in Fed rate-cut probability should move Treasury yields. A shift in tariff-escalation probability should move industrial sector stocks. A shift in Bitcoin ETF approval probability should move BTC prices. The prediction market is, in each case, the most granular available measure of how the market's aggregate belief about that event is changing in real time.

The paper tests this systematically across the entire contract universe of Polymarket and Kalshi — not one contract type, not one asset class, but all of them together — to answer: do prediction markets function as a universal, cross-asset sentiment infrastructure that carries incremental information beyond what is already captured by traditional sentiment proxies?

---

## 2. Research Questions

**Primary:** Do daily changes in prediction market implied probabilities predict corresponding financial asset returns at daily and weekly horizons, after controlling for traditional sentiment proxies?

**Secondary:**
- Which contract categories carry the most predictive power? (Macro vs political vs regulatory vs corporate)
- Does the predictive relationship differ across asset classes? (Bonds vs equities vs crypto)
- Do prediction market signals contain information orthogonal to VIX, AAII surveys, put-call ratios, and news sentiment measures?
- Is the relationship asymmetric — are upward probability surprises more informative than downward ones?

---

## 3. Theoretical Motivation

**Information aggregation:** Prediction market prices aggregate dispersed private information efficiently under the conditions established by Hayek (1945) and formalized by Wolfers and Zitzewitz (2004, JEP). The incentive-compatible structure means the price is a weighted average of beliefs, with weights determined by the intensity of conviction (measured by position size). This makes prediction market prices a superior operationalization of market sentiment compared to surveys (cheap talk), social media (unweighted noise), or analyst forecasts (strategic distortion).

**News as probability claims:** Every piece of market-moving news is implicitly a claim about the probability of some economic outcome. Prediction markets make this probability explicit and continuous. The daily change in prediction market price is therefore a direct measure of the "news surprise" component — the gap between what the market expected yesterday and what it expects today. This is precisely the variable that standard asset pricing theory predicts should drive returns.

**Cross-asset generality:** If prediction markets aggregate information about events that affect multiple asset classes, the predictive relationship should hold across the full cross-section of assets and contract types, not just in specific niches. The cross-asset test is the structural contribution of this paper — it asks whether prediction markets are generally useful as a financial data infrastructure, not just in particular cases.

---

## 4. Literature Positioning

### What has been done

**Canonical foundation:**
- Snowberg, Wolfers, and Zitzewitz (2007, QJE): Use Iowa Electronic Markets to identify partisan impacts on S&P 500. Establish the SWZ probability-scaling methodology. The theoretical ancestor of this paper.
- Snowberg, Wolfers, and Zitzewitz (2011, NBER WP 16949): "How Prediction Markets Can Save Event Studies." The methodological playbook we build on.
- Hanke, Stöckl, Weissensteiner (2020, JBF): Political event portfolios from risk-neutral prediction market probabilities. Closest structural template.

**Recent Polymarket/Kalshi literature (2024–2026):**
- Flynn and Tarkom (2025, FRL): Polymarket election odds → DJT stock. One contract type, one asset.
- Diercks, Katz, Wright (2026, FEDS/NBER): Kalshi macro contracts → macro forecasting accuracy. Establishes Kalshi as legitimate data source. Does not test asset returns.
- Mohanty and Krishnamachari (2026, arXiv): Kalshi macro contracts → crypto realized volatility. Two contract types, six crypto assets. Does not cover equities, bonds, or cross-category comparison.
- Krause (2026, SSRN): Polymarket CLARITY Act contracts → Bitcoin daily returns. Single contract, daily frequency, weak results.
- Gómez-Cram et al. (2025, SSRN): Polymarket earnings contracts outperform analyst forecasts. Corporate contracts → individual stock earnings. Does not test return predictability directly.

### The gap this paper fills

No existing paper:
1. Builds a unified panel across multiple contract categories and multiple asset classes simultaneously
2. Tests whether the predictive relationship varies across contract types (which contracts are most informative?)
3. Runs a horse race between prediction market signals and the full set of traditional sentiment proxies in a single regression framework
4. Uses contract-category fixed effects to identify which domain of prediction market information matters most for which asset class

This is not an incremental gap. It is the natural next step after the field established that prediction markets work in specific cases — the question of whether they work generally has not been asked.

---

## 5. Data

### Primary sources
- **Polymarket:** Full historical contract universe via Gamma API (gamma-api.polymarket.com) and CLOB price history. Covers approximately 450,000+ markets from 2021–2026, of which ~1,000–1,500 pass the $50k liquidity threshold and have sufficient daily observations.
- **Kalshi:** Full market catalogue and candlestick history via Trading API. Restricted to Jan 2024 onwards for adequate liquidity. Approximately 300–600 usable contracts.

### Asset price data
- **Equities/ETFs:** Yahoo Finance / yfinance — S&P 500, sector ETFs (XLE, XLV, XLI, XLK, XLF, XLY, XLP), individual stocks for CORP contracts
- **Bonds:** 2Y and 10Y Treasury yields (^IRX, ^TNX), TLT, TIPS
- **Commodities:** Crude oil (CL=F), Gold (GLD)
- **Crypto:** Binance API — BTC-USD, ETH-USD, SOL-USD at daily close
- **FX:** DXY index (DX-Y.NYB)

### Sentiment benchmarks (horse race)
- VIX (^VIX) — implied equity volatility
- CBOE put-call ratio — options market sentiment
- AAII bullish-bearish spread — retail investor survey
- Bitcoin Fear and Greed Index (alternative.me) — crypto-specific
- Google Trends uncertainty index — attention-based measure

### Sample period
- **Full sample:** January 2022 – March 2026 (Polymarket + Kalshi combined)
- **High-quality subsample:** January 2024 – March 2026 (better liquidity, restrict for robustness)

---

## 6. Methodology

### 6A. Primary Specification

Panel regression of forward asset returns on lagged prediction market probability changes:

```
R_asset(i,t+1) = α_i + β₁ ΔP_contract(i,t) + β₂ R_SP500(t) + β₃ ΔVIX(t)
               + β₄ ΔAAII(t) + β₅ FinSight_sentiment(t) + γ_cat + ε(i,t)
```

Where:
- `R_asset(i,t+1)` = log return of matched asset for contract i on day t+1
- `ΔP_contract(i,t)` = daily change in YES probability for contract i
- `γ_cat` = contract category fixed effects
- Standard errors clustered by category × week

**Hypothesis:** β₁ > 0 and statistically significant after controls

### 6B. SWZ Probability-Scaling (Event Study Layer)

For high-probability-shift events (|ΔP| > 10pp in a single day):
```
AR_scaled(i) = R_asset(t) / ΔP_contract(t)
```

This gives the implied return to a 100pp surprise, comparable across contracts and categories. Distribution of scaled ARs by category is a key descriptive result.

### 6C. Horse Race Specification

Test whether prediction market signal survives inclusion of all standard proxies:
```
R_asset(i,t+1) = α + β₁ ΔP_poly(i,t) + β₂ ΔVIX(t) + β₃ Δputcall(t)
               + β₄ ΔAAII(t) + β₅ FearGreed(t) + β₆ GoogleTrends(t)
               + γ_cat + ε(i,t)
```

Test: Is β₁ significant after β₂–β₆ are included? Does the incremental R² from adding ΔP_poly exceed 1%?

### 6D. Cross-Category Test

Interact contract category with the main coefficient:
```
R_asset(i,t+1) = α + Σ_k [β_k × ΔP(i,t) × 1{category=k}] + controls + ε(i,t)
```

Test: Do β coefficients differ significantly across categories? Which categories carry the most information?

### 6E. Cross-Asset Test

Re-estimate primary specification separately for:
- Broad equities (S&P 500)
- Sector ETFs
- Bonds (10Y yield)
- Crypto (BTC, ETH)
- Commodities (oil, gold)

Test: Is the prediction market effect uniform across asset classes or concentrated in specific ones?

---

## 7. Expected Contributions

**Contribution 1 — Empirical:** First systematic cross-asset test of prediction market signals as return predictors across contract categories. Establishes whether prediction markets function as general financial sentiment infrastructure or only in specific domains.

**Contribution 2 — Methodological:** Extends the SWZ probability-scaling methodology from political event studies to a multi-category, multi-asset panel setting. Shows how to operationalize prediction markets as a continuous RHS variable rather than an event-study instrument.

**Contribution 3 — Conceptual:** Frames prediction market contracts as structured, incentive-compatible news claims — a cleaner operationalization of "news" than text-extracted sentiment. If prediction markets outperform FinBERT/LLM sentiment in predicting returns, this has implications for the entire news-and-returns literature.

**Contribution 4 — Practical:** Documents which contract categories are most informationally rich for which asset classes. This is directly useful for practitioners using prediction market data as an alternative data source.

---

## 8. Expected Results (Priors)

Based on existing literature and preliminary data:

- **Macro contracts → bonds:** Strong, consistent. Kalshi Fed contracts had perfect forecast record day-before FOMC (Diercks et al. 2026). Expected β₁ > 0 for Treasury yield response.
- **Macro contracts → crypto volatility:** Confirmed by Mohanty-Krishnamachari (2026). Expected replication.
- **Regulatory contracts → crypto returns:** Weak in Krause (2026) at daily frequency. Expected improvement with multi-contract, higher-frequency design.
- **Trade/tariff contracts → industrial sectors:** Untested. Prior: moderate effect, concentrated around Liberation Day 2025 and subsequent reversals.
- **Geopolitical contracts → oil/gold:** Prior: strong during active conflict escalation, weak during stable periods. Regime-dependent.
- **Corporate contracts → individual stocks:** Prior: consistent with Gómez-Cram et al. (2025) earnings findings. Expected significant β₁.
- **Horse race vs traditional proxies:** Prior: prediction markets add incremental R² specifically for regulatory and corporate categories where VIX and AAII are poor proxies for event-specific uncertainty.

---

## 9. Potential Problems and Mitigations

| Problem | Mitigation |
|---|---|
| Wash trading inflates Polymarket volume | Use price not volume as signal; flag Oct–Dec 2024 per Sirolly et al. (2025); robustness test excluding flagged dates |
| Thin liquidity on many contracts | $50k volume threshold; report results separately for liquid vs thin contracts |
| Endogeneity — asset prices and prediction markets both react to same news | Use lagged ΔP (t → t+1 return); SWZ scaling with event-specific IVs for robustness |
| Multiple testing across categories | Benjamini-Hochberg correction; report family-wise error rate |
| Short time series (Kalshi pre-2024 thin) | Separate Polymarket and Kalshi subsamples; restrict to 2024+ for Kalshi |
| Mapping contracts to assets is subjective | Pre-specified mapping table (fixed before looking at results); sensitivity to alternative mappings |
| Field moving fast — getting scooped | Pre-register on OSF immediately to establish priority |

---

## 10. Paper Structure

1. **Introduction** (~1,000 words)
   - The prediction market as information infrastructure framing
   - Gap statement: nobody has done the cross-asset unified test
   - Preview of main findings

2. **Institutional Background** (~800 words)
   - Polymarket and Kalshi as data sources
   - Contract mechanics, liquidity, resolution
   - 2024–2026 volume growth — why now

3. **Literature Review** (~1,500 words)
   - Strand 1: Prediction markets as data (SWZ lineage)
   - Strand 2: Recent Polymarket/Kalshi papers
   - Strand 3: Traditional sentiment proxies and returns
   - Gap statement

4. **Data** (~1,200 words)
   - Contract universe construction
   - Categorization methodology
   - Asset matching
   - Summary statistics table

5. **Methodology** (~1,000 words)
   - Primary panel specification
   - SWZ scaling for event study layer
   - Horse race design
   - Cross-category and cross-asset tests

6. **Results** (~2,000 words)
   - 6.1 Primary panel results (Table 2)
   - 6.2 Horse race: incremental R² vs traditional proxies (Table 3)
   - 6.3 Cross-category decomposition (Table 4 / Figure 2)
   - 6.4 Cross-asset results (Table 5)
   - 6.5 SWZ scaled abnormal returns by category (Figure 3)

7. **Robustness** (~800 words)
   - Wash-trading exclusion
   - Liquid subsample only
   - Kalshi-only and Polymarket-only subsamples
   - Alternative asset matching

8. **Discussion** (~600 words)
   - Which domains carry most information and why
   - Implications for the "news and returns" literature
   - Limits and future directions

9. **Conclusion** (~400 words)

**Estimated length:** 9,000–11,000 words + 5 tables + 4 figures
**Estimated time to full draft (post-data):** 4–5 weeks

---

## 11. Journal Targets

| Venue | Tier | Rationale |
|---|---|---|
| Journal of Financial Markets | B+ | Cross-asset, microstructure-adjacent; good fit |
| Journal of Banking and Finance | B+ | Empirical finance; broad scope; receptive to data papers |
| Finance Research Letters | B | Short-form; fast turnaround; where prediction market papers are landing |
| International Review of Financial Analysis | B | Breadth-friendly; good for novel data source papers |
| Journal of Behavioral Finance | B | If behavioral interpretation is emphasized |

**Do not target:** JF, RFS, JFE — requires order-of-magnitude more identification sophistication.

**Realistic target:** JBF or JFM if results are clean across 3+ categories. FRL if results are strong in 1–2 categories only.

---

## 12. Portfolio Fit

**Theme:** Frontier data sources at the intersection of financial economics and emerging digital infrastructure. Consistent with:
- CEIR: energy anchoring in crypto — novel data source (energy production) for asset pricing
- Invisible Ledger: measuring what tax systems can't see — novel measurement problem
- Digital Tax ASEAN: policy-economics at the frontier of digital economy measurement
- SPK Derivatives: physics-grounded derivatives pricing — unconventional methodology

**Distinctive positioning:** Prediction markets as data infrastructure, not as financial markets. The framing sidesteps the "is this gambling" question entirely and repositions the contribution as information economics applied to a new class of continuous, incentive-compatible probability data.

---

## 13. Open Questions (Resolve Before Writing)

1. Should CRYPTO_PRICE contracts (direct BTC/ETH price prediction) be included or excluded from main analysis? Including creates endogeneity; excluding loses a category.
2. Kalshi and Polymarket: pool from the start or run separately and compare?
3. For CORP contracts: restrict to S&P 500 constituents or include any company with a liquid contract?
4. Time window: full 2021–2026 history or restrict to 2023–2026 for liquidity quality?
5. Should tariff contracts (TRADE) be separated from geopolitical (POL_GEO) or merged given overlap during 2025?

---

## 14. Next Steps

- [ ] Run repo agent pipeline to collect and categorize full contract universe
- [ ] Inspect contract distribution across categories — validate taxonomy
- [ ] Pull asset return data and merge with contract panel
- [ ] Run summary statistics — check coverage, gaps, liquidity distribution
- [ ] Run preliminary OLS on highest-liquidity subsample as proof of concept
- [ ] Pre-register on OSF once design is locked
- [ ] Begin writing Introduction and Data sections in parallel with analysis