# Research Loop Status (Alpha Simulation)

This repo now has a repeatable “research loop” for alternative-data alpha testing, plus a benchmarked baseline that already beats SPY (modestly) over 2016–2026.

## 1) Reddit-only alpha (current data)

Runner: `Sharpe-Renaissance/scripts/reddit_research_loop.py`

Current limiting factor: the Reddit daily panel only overlaps prices for **~42 trading days** (signals were collected recently), so results are *not yet statistically meaningful*.

Latest runs (outputs under `Sharpe-Renaissance/backtests/outputs/reddit_research_loop/`):
- `baseline_10x3_cost10/summary.json` (slight full-period outperformance, but window beat-rate < 50%)
- `mom5_min0_10x3_cost10/summary.json` (momentum filter did not improve robustness on this short sample)

To make this meaningful: run the daily Reddit ingestion for a few months so the panel covers a wide range of regimes.

## 2) “Beats SPY” baseline (already exists, long horizon)

This is a leveraged-ETF + regime/risk control strategy (not stock-picking), but it provides a real benchmark for what “SPY-beating” looks like under costs.

Run artifacts:
- `Sharpe-Renaissance/backtests/outputs/spy_beater/best_full/summary.json`
- Random-window robustness (21–252 trading day windows):
  - `Sharpe-Renaissance/backtests/outputs/spy_beater/best_full/random_window_eval/summary.json`

Window sampling runner:
- `Sharpe-Renaissance/scripts/random_window_eval.py`

## 3) What to do next (highest impact)

1. **Keep building the Reddit dataset daily** (non-destructive):
   - `python3 Sharpe-Renaissance/scripts/reddit_ingest_daily.py ...` (see `Sharpe-Renaissance/REDDIT_SIGNALS.md`)
2. **Re-run the Reddit research loop weekly/monthly**:
   - `python3 Sharpe-Renaissance/scripts/reddit_research_loop.py ...`
3. **Then integrate Reddit as a small sleeve** on top of the SPY-beater / dynamic-regime runs (once Reddit has enough history to justify it).

## 4) Automation (recommended)

### Daily ingest (systemd user timer)

- Install + enable: `bash Sharpe-Renaissance/scripts/install_reddit_systemd_user.sh`
- Logs: `journalctl --user -u reddit-ingest.service -n 200 --no-pager`

### Weekly scorecard (systemd user timer)

This generates a dated report folder under:
- `Sharpe-Renaissance/backtests/outputs/reddit_weekly_scorecard/YYYY-MM-DD/`

Install + enable:
- `bash Sharpe-Renaissance/scripts/install_reddit_research_systemd_user.sh`

## 5) Walk-forward tuning (avoid overfitting)

This selects Reddit sleeve configs on a train window and reports out-of-sample test performance per fold:
- `python3 Sharpe-Renaissance/scripts/walkforward_reddit_overlay.py`

Outputs:
- `Sharpe-Renaissance/backtests/outputs/reddit_walkforward_overlay/<timestamp>/summary.json`
- `Sharpe-Renaissance/backtests/outputs/reddit_walkforward_overlay/<timestamp>/folds.csv`
- `Sharpe-Renaissance/backtests/outputs/reddit_walkforward_overlay/<timestamp>/picks.csv`

## 6) Paper trading loop (execution + reconciliation)

The repo includes a paper-trading loop that runs:
signal generation → order generation → paper execution → reconciliation/ledger.

Docs:
- `Sharpe-Renaissance/PAPER_TRADING.md`
