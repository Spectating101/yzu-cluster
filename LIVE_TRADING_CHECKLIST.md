## Live Trading Checklist (Engineering Safety)

This checklist is about avoiding operational errors (wrong day, wrong symbols, runaway orders). It does not eliminate market risk.

### Before you ever run `--execute`
- Use a broker paper account first (e.g., Alpaca paper).
- Confirm strategy universe matches broker-available symbols (e.g., `SPY`, `UPRO`, `BIL`).
- Ensure credentials are set in env vars (do not paste them into files):
  - `ALPACA_API_KEY_ID`
  - `ALPACA_SECRET_KEY`
  - `ALPACA_BASE_URL` (paper: `https://paper-api.alpaca.markets`)
  - Optional for last prices: `ALPACA_DATA_BASE_URL`
- Set a kill switch you can toggle instantly:
  - `export TRADING_KILL_SWITCH=1` to hard-stop all executions

### Each trading day (recommended flow)
1) Generate the signal:
   - `python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_signal_ready.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run`
2) Review the signal artifact:
   - `Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json`
   - Sanity checks: weights sum to ~1, no negatives, only expected symbols.
3) Dry-run execution:
   - `python3 Sharpe-Renaissance/scripts/live_trade_from_signal.py --signal-json Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/live_exec`
   - Inspect `Sharpe-Renaissance/backtests/outputs/spy_beater/live_exec/orders_proposed.json`
4) Only if the proposed orders look correct:
   - Unset kill switch: `unset TRADING_KILL_SWITCH`
   - Execute: `python3 Sharpe-Renaissance/scripts/live_trade_from_signal.py --signal-json Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_signal_ready_run/signal.json --execute`
5) Confirm broker state matches expectation (positions and cash).

### Guardrails you can tighten
- `--allowed-symbols SPY UPRO` (and optionally `BIL` if you actually trade it)
- `--max-turnover 0.30` (lower = fewer/lower-size trades)
- `--max-order-notional 10000`
- Prefer `--order-type limit` and adjust `--limit-buffer-bps` if you see non-fills.

