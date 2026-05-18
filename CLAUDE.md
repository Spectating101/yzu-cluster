# Sharpe-Renaissance

## What This Is
Quantitative trading platform with a live alpha signal pipeline. Currently paper-trading a monthly-rebalance multi-asset strategy (SEC event alpha + ridge regression walk-forward).

## Architecture

```
Data (yfinance, SEC EDGAR)
  → Feature Engineering (insights + event-proxy features)
    → Walk-Forward Backtest (ridge regression, monthly)
      → Signal Export (signal.json with weights)
        → Paper Tracker (daily mark-to-market ledger)
          → Scorecard (CAGR, Sharpe, drawdown)
```

### Active Pipeline (what runs daily)
- **`scripts/alpha_live_cycle.py`** — Main entry point. Fetches prices, builds features, runs walk-forward, exports signal, marks-to-market.
- **`scripts/alpha_paper_tracker.py`** — Simulates holding signal weights, writes daily equity to ledger.csv.
- **`scripts/alpha_daily_scorecard.py`** — Reads ledger + signal, computes performance metrics + benchmark comparison.
- **`scripts/alpha_insights_walkforward_runner.py`** — Walk-forward backtest engine (ridge regression, ic_tstat alpha mode).

### Supporting Infrastructure
- **`src/strategy/regime_policy.py`** — Mechanical regime detection (trend/vol/drawdown → parameter adjustment).
- **`src/intelligence/`** — Technical indicators, insights engine.
- **`engine/`** — Full trading engine (Rust bindings, research service, LLM service, storage).
- **`api/`** — REST API (auth, billing, SEC EDGAR data source).
- **`trading/`** — Execution layer (not active in paper mode).
- **`agents/finrobot/`** — Git submodule (external FinRobot dependency).

### Directory Layout
```
scripts/            # 111 Python scripts (alpha pipeline, backtests, analytics)
src/                # Core library (strategy, intelligence, models, data_sources)
engine/             # Trading engine (Rust, research, LLM, storage)
api/                # REST API server (auth, billing, EDGAR)
trading/            # Execution layer
backtests/outputs/  # Backtest results, signals, paper trading ledger
data_lake/          # Price panels, analytics packs, feature caches
config/             # YAML configs, ticker lists
```

## Running Things

### Daily Paper Trading Cycle
```bash
python3 Sharpe-Renaissance/scripts/alpha_live_cycle.py
```

### Paper Tracker Only (mark-to-market with existing signal)
```bash
python3 Sharpe-Renaissance/scripts/alpha_paper_tracker.py \
  --signal Sharpe-Renaissance/backtests/outputs/signals/alpha_live_signal.json \
  --panel Sharpe-Renaissance/data_lake/daily_alpha_panel.csv
```

### Scorecard Only
```bash
python3 Sharpe-Renaissance/scripts/alpha_daily_scorecard.py
```

### Full Ledger Regeneration (both signals)
```bash
# 1. Delete existing ledger
rm Sharpe-Renaissance/backtests/outputs/alpha_paper/ledger.csv

# 2. Run old signal (Dec 2025)
python3 Sharpe-Renaissance/scripts/alpha_paper_tracker.py \
  --signal Sharpe-Renaissance/backtests/outputs/signals/alpha_eventproxy_cfg12.json \
  --panel Sharpe-Renaissance/data_lake/daily_alpha_panel.csv

# 3. Run new signal (Jan 2026) — overwrites overlapping dates
python3 Sharpe-Renaissance/scripts/alpha_paper_tracker.py \
  --signal Sharpe-Renaissance/backtests/outputs/signals/alpha_live_signal.json \
  --panel Sharpe-Renaissance/data_lake/daily_alpha_panel.csv

# 4. Regenerate scorecard
python3 Sharpe-Renaissance/scripts/alpha_daily_scorecard.py
```

## Tests
```bash
cd Sharpe-Renaissance && python3 -m pytest tests/ -v
# 28 tests, <1s — covers paper tracker, scorecard metrics, regime policy
```

## Current Live Signal
- **Strategy**: `alpha_eventproxy_cfg12` (ridge regression, IC t-stat alpha mode)
- **As-of**: 2026-01-31 (monthly rebalance)
- **Holdings**: ETH-USD 27%, GLD 23%, BIL 20%, BTC-USD 18%, EEM 12%
- **Paper trading since**: 2026-01-01

## Key Files
| File | Purpose |
|------|---------|
| `backtests/outputs/signals/alpha_live_signal.json` | Current signal weights |
| `backtests/outputs/signals/alpha_eventproxy_cfg12.json` | Previous signal weights |
| `backtests/outputs/alpha_paper/ledger.csv` | Daily equity ledger |
| `backtests/outputs/alpha_paper/scorecard_latest.json` | Latest scorecard |
| `data_lake/daily_alpha_panel.csv` | Price panel (13 instruments, 10y) |
| `config/tickers_multi_asset_core.txt` | Ticker universe |

## Known Issues
- `datetime.utcnow()` deprecated — used in 30+ places in engine/api layer (not in active pipeline)
- `finrobot` submodule has bare `except:` clauses (external code, don't modify)
- Best backtest: CAGR 35.1%, Sharpe 1.44 (run6, 3.5yr) — live performance lower due to regime shift

## Design Decisions
- **Monthly rebalance only** — signal weights held constant within each month
- **Paper tracker overwrites**: When signal transitions, new signal rows replace old signal rows for overlapping dates via explicit date-match removal in `_append_row`
- **Equity continuity**: New signal inherits prior signal's terminal equity at the transition date (not the last row, but equity at or before `as_of`)
- **Regime policy**: Rule-based, no LLMs — de-risks on negative trend or deep drawdown
