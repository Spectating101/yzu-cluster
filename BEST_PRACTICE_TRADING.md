# Best-Practice Trading Evaluation (Sharpe-Renaissance)

This repo can generate signals and backtests, but the difference between “cool research” and “tradable” is **evaluation discipline**.

## The standard used here (default)

1) **No tuning on the holdout**
- Pick parameters on a validation period only.
- Report performance on a final holdout period that is never used for selection.

2) **Apples-to-apples benchmarks**
- If the strategy is “stable / risk-managed”, benchmark it against a baseline that uses the **same risk overlays** (e.g., vol targeting + drawdown throttle).
- Otherwise you’re comparing a risk-managed portfolio to “raw BTC top speed”.

3) **Costs and turnover**
- Always include transaction costs (and later, slippage) and penalize excessive turnover.

4) **Robustness checks**
- Use window sampling / walk-forward splits (not one backtest) before trusting results.

## Crypto “stable allocator” workflow

### 0) (Optional) Attach an “academic consensus snapshot” (Cite-Agent)

If you have the Cite-Agent API server running (usually on `http://127.0.0.1:8001`), you can
save topic snapshots into this repo for traceability:

```bash
python3 Sharpe-Renaissance/scripts/refresh_cite_agent_context.py \
  --cite-agent-url http://127.0.0.1:8001 \
  --out-dir Sharpe-Renaissance/data_lake/research_context \
  --create-missing
```

Notes:
- This is meant to be a **context artifact** (what the system believed the “academic lens” was),
  not a way to “prove alpha”.
- Do not expose the Cite-Agent server to the public internet without authentication.

### 1) Run the best-practice selector (offline, no keys required)

Uses:
- `scripts/crypto_passive_ml_portfolio.py` as the strategy engine.
- BTC/ETH 60/40 **risk-managed** as the benchmark (with the same overlays).

Command:
```bash
python3 Sharpe-Renaissance/scripts/best_practice_crypto_runner.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_crypto_extended.csv \
  --out-dir Sharpe-Renaissance/backtests/outputs/crypto_best_practice
```

Optionally embed Cite-Agent topics in the run summary:
```bash
python3 Sharpe-Renaissance/scripts/best_practice_crypto_runner.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_crypto_extended.csv \
  --out-dir Sharpe-Renaissance/backtests/outputs/crypto_best_practice \
  --cite-agent-url http://127.0.0.1:8001 \
  --cite-topics Risk_Managed_Portfolios Crypto_CrossSectional_Momentum Market_Impact_Slippage
```

Outputs:
- `Sharpe-Renaissance/backtests/outputs/crypto_best_practice/best.json`
- `Sharpe-Renaissance/backtests/outputs/crypto_best_practice/grid_results.csv`
- `Sharpe-Renaissance/backtests/outputs/crypto_best_practice/summary.json`

### 2) Run the chosen config end-to-end (and sample windows)

Take the parameters from `best.json` and run:
```bash
python3 Sharpe-Renaissance/scripts/crypto_passive_ml_portfolio.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_crypto_extended.csv \
  --out-dir Sharpe-Renaissance/backtests/outputs/crypto_passive_ml_selected \
  --sample --samples 30 --window-months 60
```

## Interpreting “good”

For a passive/steady mandate, focus on:
- **Max drawdown** and **worst 12 months** (can you live through it?)
- **Sharpe / Calmar** (risk-adjusted quality)
- **Excess return vs risk-managed benchmark** (is it doing anything special?)

If it only looks good vs *raw BTC* but not vs a risk-managed BTC/ETH baseline, it’s usually not adding real value.

## Equities “academic runner” workflow

### 1) Run the equity best-practice selector (validation/holdout)

This selects parameters on validation only and reports holdout vs a risk-managed benchmark (default `SPY`):

```bash
python3 Sharpe-Renaissance/scripts/best_practice_equity_runner.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_panel_large.csv \
  --market-ticker SPY \
  --universe equities \
  --factor-set parsimonious \
  --out-dir Sharpe-Renaissance/backtests/outputs/equity_best_practice
```

Optional robustness sampling (random windows):
```bash
python3 Sharpe-Renaissance/scripts/best_practice_equity_runner.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_panel_large.csv \
  --market-ticker SPY \
  --universe equities \
  --factor-set parsimonious \
  --out-dir Sharpe-Renaissance/backtests/outputs/equity_best_practice \
  --sample --samples 20 --window-months 60
```

### 2) Run a single backtest with realism knobs

The runner supports friction knobs for a more tradable estimate:
- `--cost-bps`
- `--slippage-bps`, `--slippage-cap-bps`, `--slippage-ref-participation`
- `--min-median-dollar-volume` (liquidity gating)

## Multi-Asset “Alpha + PM” workflow (Constrained, default)

Objective:
- Maximize CAGR **subject to** max drawdown (MDD) staying under a fixed budget (default 25%) across multiple sampled 8-year windows.

### 1) Run the constrained sweep (search for best config)

This does:
- Screen random configs on the full sample
- Then validates top candidates on multi-window robustness

```bash
python3 Sharpe-Renaissance/scripts/alpha_constrained_sweep.py \
  --feature-cache Sharpe-Renaissance/backtests/outputs/alpha_feature_cache/all_insights_features.parquet \
  --benchmark SPY \
  --universe all \
  --train-months 48 \
  --cost-bps 10 \
  --regime-filter \
  --regime-window 12 \
  --dd-budget 0.25 \
  --n-samples 20 \
  --top-k 5 \
  --window-months 96 \
  --n-windows 6 \
  --out-dir Sharpe-Renaissance/backtests/outputs/alpha_constrained_sweep_dd25
```

### 2) Run the current best “DD<=25%” configuration

Best (from `alpha_constrained_sweep_dd25/best.json`) is validated in:
- `Sharpe-Renaissance/backtests/outputs/robust_best_dd25_cfg12/windows.csv` (window robustness + feature-shuffle null)
- `Sharpe-Renaissance/backtests/outputs/alpha_best_dd25_cfg12_full/summary.json` (full-period run)

```bash
python3 Sharpe-Renaissance/scripts/alpha_insights_walkforward_runner.py \
  --feature-cache Sharpe-Renaissance/backtests/outputs/alpha_feature_cache/all_insights_features.parquet \
  --benchmark SPY \
  --universe all \
  --train-months 48 \
  --top-n 4 \
  --max-weight 0.5 \
  --cost-bps 10 \
  --target-vol 0.20 \
  --max-gross 1.25 \
  --allow-leverage \
  --regime-filter \
  --regime-window 12 \
  --base trend \
  --alpha-mode ic_tstat \
  --ic-months 12 \
  --alpha-tstat-scale 1.5 \
  --corr-filter \
  --corr-threshold 0.80 \
  --corr-lookback 6 \
  --risk-budget \
  --max-turnover 0.75 \
  --pf-dd-threshold 0.20 \
  --pf-dd-floor-gross 0.85 \
  --out-dir Sharpe-Renaissance/backtests/outputs/alpha_best_dd25_cfg12_full
```

## Control Profiles (New)

You can now switch risk-control behavior with one flag instead of manually tuning multiple knobs:

- `--control-profile off`: no sleeve/circuit controls.
- `--control-profile growth`: light controls (cash floor + crypto cap), no circuit breaker.
- `--control-profile balanced`: light caps + moderate circuit breaker.
- `--control-profile defensive`: strict caps + active circuit breaker.
- `--control-profile custom`: use explicit `--min-cash-weight`, `--max-crypto-gross`, `--cb-*` flags.

List built-in profiles:

```bash
python3 Sharpe-Renaissance/scripts/alpha_insights_walkforward_runner.py --print-control-profiles
```

Every run now writes:
- `summary.json` (includes a `controls` block)
- `run_config.json` (exact reproducible CLI config)

### Current profile test (same alpha config, same dataset)

Artifacts:
- `Sharpe-Renaissance/backtests/outputs/control_profile_eval_summary.json`

Results:
- `off`: CAGR 41.53%, Sharpe 1.299, MDD -14.12%
- `growth`: CAGR 40.82%, Sharpe 1.324, MDD -12.75%  **(recommended default)**
- `balanced`: CAGR 32.31%, Sharpe 1.289, MDD -12.09%
- `defensive`: CAGR 23.81%, Sharpe 1.168, MDD -12.83%

Interpretation:
- `growth` preserves almost all return of `off` while materially improving drawdown.
- `balanced/defensive` are useful when you prioritize stability over return.

### Timeline robustness (growth profile)

Artifacts:
- `Sharpe-Renaissance/backtests/outputs/control_profile_growth_robustness_windows/windows.csv`
- `Sharpe-Renaissance/backtests/outputs/control_profile_growth_robustness_windows/summary.json`

Compact 5-year window sweep (3 windows):
- Median CAGR: 52.3%
- Median Sharpe: 1.53
- Median MDD: -13.5%
- 2/3 windows beat risk-matched benchmark on both CAGR and Sharpe; 1/3 window still beats on CAGR but lags on Sharpe.

---

## Upgrade: Event-Proxy Alpha (Higher Performance)

This is the current best upgrade path in this repo: keep the same alpha runner, but add **event-proxy features**
derived from daily price/volume (jump/tail + volume shock + *forced-flow proxies*). This improves risk-adjusted performance and
window robustness versus the prior cfg12 baseline.

Practical note (MSCI / index reconstitution style “debacles”):
- You usually don’t need the news text. The *footprint* shows up as **dollar-volume spikes** and **tail/jump clustering**.
- This is why `--event-proxy` includes `dollar_vol_z` and tail/jump counters.
- There is an experimental `--event-proxy-extended` flag for extra flow/shock counters; it’s currently **noisy** and can worsen drawdowns, so it’s off by default.

Reference artifacts:
- Full-period run: `Sharpe-Renaissance/backtests/outputs/alpha_eventproxy_cache_build_v3/summary.json`
- Robustness + null: `Sharpe-Renaissance/backtests/outputs/robust_eventproxy_cfg12/summary.json`

## Event Backup Gate (Regime Override)

Use this when you want a dislocation-specific backup module:
- `event_rebound`: tilt into rebound candidates during gate-on days.
- `defensive_cash`: cut risky gross and park the difference in cash during gate-on days.

Command:

```bash
python3 Sharpe-Renaissance/scripts/alpha_event_gate_overlay.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_multi_asset_core_10y.csv \
  --positions Sharpe-Renaissance/backtests/outputs/alpha_eventproxy_cache_build_v3/positions.csv \
  --out-dir Sharpe-Renaissance/backtests/outputs/alpha_event_gate_defensive_best \
  --benchmark SPY \
  --cash-ticker BIL \
  --backup-mode defensive_cash \
  --defensive-cut 0.50 \
  --ret-z-on 1.8 --ret-z-off 0.8 \
  --dvz-on 0.8 --dvz-off 0.2 \
  --min-on-days 3 --calm-off-days 3
```

Current result on the multi-asset core 10y panel:
- Baseline alpha (no gate): CAGR ~0.221, Sharpe ~0.873, MDD ~-0.270
- Defensive gate (`defensive_cut=0.50`): CAGR ~0.226, Sharpe ~0.950, MDD ~-0.236

### 1) Build (or reuse) the feature cache

```bash
python3 Sharpe-Renaissance/scripts/alpha_insights_walkforward_runner.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_multi_asset_core_10y.csv \
  --use-insights \
  --event-proxy \
  --feature-cache Sharpe-Renaissance/backtests/outputs/alpha_feature_cache/all_insights_plus_eventproxy_v3.parquet \
  --out-dir Sharpe-Renaissance/backtests/outputs/alpha_eventproxy_cache_build_v3
```

### 2) Export a passive monthly “signal.json”

```bash
python3 Sharpe-Renaissance/scripts/export_alpha_signal.py \
  --panel Sharpe-Renaissance/data_lake/yfinance_multi_asset_core_10y.csv \
  --feature-cache Sharpe-Renaissance/backtests/outputs/alpha_feature_cache/all_insights_plus_eventproxy_v3.parquet \
  --out Sharpe-Renaissance/backtests/outputs/signals/alpha_eventproxy_cfg12.json \
  --benchmark SPY \
  --cash-ticker BIL \
  --allow-leverage \
  --regime-filter \
  --corr-filter \
  --risk-budget
```

### 3) Paper-track whether the picks are good (daily mark-to-market)

```bash
python3 Sharpe-Renaissance/scripts/alpha_paper_tracker.py \
  --signal Sharpe-Renaissance/backtests/outputs/signals/alpha_eventproxy_cfg12.json \
  --panel Sharpe-Renaissance/data_lake/yfinance_multi_asset_core_10y.csv \
  --ledger Sharpe-Renaissance/backtests/outputs/alpha_paper/ledger.csv \
  --initial-equity 10000
```

Note: if you update the panel with fresh prices (yfinance/broker export), re-run the export and tracker to evaluate live.

### 4) One-command yfinance “live cycle” (panel → cache → signal → ledger)

This runs yfinance fetch + cache build + signal export + paper ledger update:

```bash
python3 Sharpe-Renaissance/scripts/alpha_live_cycle.py
```

Outputs (defaults):
- `Sharpe-Renaissance/data_lake/daily_alpha_panel.csv`
- `Sharpe-Renaissance/backtests/outputs/alpha_feature_cache/daily_alpha_features.parquet`
- `Sharpe-Renaissance/backtests/outputs/signals/alpha_live_signal.json`
- `Sharpe-Renaissance/backtests/outputs/alpha_paper/ledger.csv`

### 5) Run in background (systemd user timer)

Install a daily background run (recommended):

```bash
bash Sharpe-Renaissance/scripts/install_alpha_live_cycle_systemd_user.sh
```

Check logs:

```bash
journalctl --user -u alpha-live.service -n 200 --no-pager
systemctl --user status alpha-live.timer --no-pager
```

### Optional: Inject “MSCI debacle” (or any external event) without live news

If you want the system to respect a known external event (index rebalance issue, vendor error, etc.),
create a manual event feed:

- Copy `Sharpe-Renaissance/data_lake/manual_events.sample.csv` → `Sharpe-Renaissance/data_lake/manual_events.csv`
- Set:
  - `Score` in `[-1,+1]` (negative = risk-off pressure, positive = risk-on)
  - optional `Tickers` (semicolon-separated); blank means “global”
  - optional `Horizon_Days` (how long it stays active)

The background `alpha-live` cycle will automatically read `Sharpe-Renaissance/data_lake/manual_events.csv` if it exists.
