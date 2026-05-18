## Dynamic Regime Signal Generator (Paper-Trading Ready)

### One-time setup
- Pull Git LFS datasets: `git lfs pull`
- Start the local Cite-Agent stack (optional, only needed if you’re refreshing research topics): `bash Sharpe-Renaissance/scripts/run_cite_agent_stack.sh`

### Run the current “signal-ready” protocol
This runs the full backtest (fast) and emits a next-day holdings suggestion:

`python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_signal_ready.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run`

### Run the tuned (2025) protocol
This variant disables the hard-vol gate (the main identified source of false risk-off in 2025) while keeping the crash gate.

`python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_tuned_2025.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_tuned_2025_run`

Artifacts:
- `Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/summary.json`
- `Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/regime_log.csv`
- `Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/weights.csv`
- `Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json`

### What the signal means
- `signal.json` contains the weights selected at `as_of` close and intended for the next bar (next trading day).
- This is research tooling; it does not include broker execution, sizing, or real-time data safeguards.

### Live execution (opt-in, strict safety gates)
This repo includes a “safe by default” live executor that:
- defaults to dry-run
- enforces staleness checks, symbol allowlists, turnover caps, order size caps, and idempotency
- requires explicit `--execute`

Dry-run (recommended first):
`python3 Sharpe-Renaissance/scripts/live_trade_from_signal.py --signal-json Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/live_exec`

Live (only after you set broker credentials and review `orders_proposed.json`):
`python3 Sharpe-Renaissance/scripts/live_trade_from_signal.py --signal-json Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json --execute --ack-live-risk`

### Refresh “academic angle” context (optional)
`python3 Sharpe-Renaissance/scripts/refresh_academic_angles.py --create-missing --update`
`python3 Sharpe-Renaissance/scripts/generate_academic_angle_report.py`
