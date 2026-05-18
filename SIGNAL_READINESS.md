# Sharpe-Renaissance Signal Readiness (Current)

This repo can generate **research-grade** signals and backtests, but that is not the same as being ready to trade live with real money. This document captures what is working, what the latest walk-forward runs show, and what must be true before treating outputs as a deployable “trading signal”.

## What “signal-ready” means here

Minimum bar before any live usage:
- **Reproducible signal export**: deterministic config → `signal.json` with weights + exposure scale.
- **Walk-forward evidence**: multiple folds, with explicit frictions (costs/slippage) and stability caps.
- **No obvious leakage**: the signal uses only information available at the decision time.
- **Guardrails**: max weight, liquidity gates, volatility/drawdown overlays, and “do nothing” behavior on missing data.
- **Paper trading**: at least 4–8 weeks of end-to-end paper execution logs (including data failures).

## Current status (as of this workspace run)

### Infrastructure
- Rust engine builds and imports in the local venv (`sharpe_rust`) and mock cycle runs: `make smoke`.
- Python test suite passes: `pytest -q`.
- Signal export script exists: `scripts/export_trading_signal.py`.

### Equity academic model (cross-sectional)
Run: `scripts/best_practice_equity_runner.py` on `data_lake/yfinance_nasdaq100_10y_plus_bench.csv`.

Outcome:
- Validation window looked acceptable, **but holdout (test) performance was materially negative** vs benchmark.
- This means the current equity academic configuration is **not signal-ready** without additional constraints/diagnostics.

Artifacts:
- `backtests/outputs/equity_best_practice_run1_nasdaq/best.json`

### Multi-asset trend model (time-series momentum)
Runs:
- Robust sweep: `backtests/outputs/multi_asset_research_run1/`
- Best-practice grid: `backtests/outputs/multi_asset_best_practice_run1/`

Outcome:
- The best configs show good absolute Sharpe + low drawdowns on this panel, but are **not a consistent SPY beater** across folds.
- Interpreting this as “signal-ready” depends on the objective:
  - If the goal is **diversifying return stream / risk-managed allocation**, it may be usable after paper trading.
  - If the goal is **beat SPY**, current evidence does not support that claim.

Signal export:
- `backtests/outputs/signals/multi_asset_signal.json`

## How to reproduce (recommended)

From `Sharpe-Renaissance/`:
- Create venv and install: `python3 -m venv .venv && . .venv/bin/activate && pip install -e .`
- Build Rust: `make build-rust`
- Smoke: `make smoke PYTHON=python`

Multi-asset research + signal:
- `python scripts/robust_multi_asset_research.py --panel data_lake/yfinance_multi_asset_core_10y.csv --out-dir backtests/outputs/multi_asset_research_runX --max-evals 200`
- `python scripts/export_trading_signal.py --mode multi-asset --panel data_lake/yfinance_multi_asset_core_10y.csv --config-json backtests/outputs/multi_asset_research_runX/best.json --out backtests/outputs/signals/multi_asset_signal.json`

## Before going live (next work items)

1. Define the objective: **SPY-beater** vs **diversifier** vs **drawdown-reducer**.
2. Add explicit “do not trade” rules:
   - minimum number of eligible assets
   - minimum liquidity (already supported)
   - maximum turnover per rebalance
3. Expand out-of-sample validation:
   - more folds or a longer holdout
   - sensitivity analysis to cost/slippage and signal thresholds
4. Paper trade with the exact data pipeline and rebalance schedule.
5. Only then consider live trading (and start with small size).

