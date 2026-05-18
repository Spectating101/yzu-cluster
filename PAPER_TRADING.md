# Paper Trading Loop (Signal → Orders → Reconciliation)

This repo includes a safe paper-trading pipeline that behaves like a simplified hedge-fund daily loop:

1. Generate a **signal** from the dynamic-regime protocol (`signal.json`)
2. Compute rebalance orders with strict safety gates
3. Execute those orders against a **local paper broker** (`FileBroker`) backed by:
   - a JSON portfolio state (`cash`, `positions`)
   - a tidy price panel CSV (`Instrument,Date,Price_Close`)
4. Write a daily report + append to a portfolio ledger

## Run once

```bash
python3 Sharpe-Renaissance/scripts/paper_trade_pipeline.py --execute
```

Artifacts land under:
- `Sharpe-Renaissance/backtests/outputs/paper_live/YYYY-MM-DD/`
- ledger: `Sharpe-Renaissance/backtests/outputs/paper_live/ledger.csv`
- state: `Sharpe-Renaissance/backtests/outputs/paper_live/state.json`
- snapshots: `Sharpe-Renaissance/backtests/outputs/paper_live/snapshots/YYYY-MM-DD.json`
- alerts (when risk gates block execution): `Sharpe-Renaissance/backtests/outputs/paper_live/alerts/YYYY-MM-DD.json`

Dry-run mode:
```bash
python3 Sharpe-Renaissance/scripts/paper_trade_pipeline.py
```

## Change protocol / panel

```bash
python3 Sharpe-Renaissance/scripts/paper_trade_pipeline.py \
  --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_signal_ready.json \
  --out-root Sharpe-Renaissance/backtests/outputs/paper_live \
  --execute
```

## Portable long/short sleeve (optional)

The pipeline can optionally apply a **portable (market-neutral) long/short momentum sleeve** on top of the base signal.
This produces a derived signal with **negative weights** (shorts) and requires a broker that supports short positions.

Paper example:
```bash
python3 Sharpe-Renaissance/scripts/paper_trade_pipeline.py \
  --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_signal_ready.json \
  --portable-ls \
  --portable-universe Sharpe-Renaissance/config/universes/intel_stocks_current.txt \
  --portable-sleeve-gross 0.20 \
  --portable-long-k 10 \
  --portable-short-k 10 \
  --portable-only-when-regime risk_on \
  --execute
```

Safety gates for the sleeve:
- `--portable-max-gross-exposure` (default `1.60`)
- `--portable-max-short-exposure` (default `0.35`)

## Safety / kill switch

Set `TRADING_KILL_SWITCH=1` in the environment to force the executor to refuse any trading action (even paper).

## Risk gates (paper)

The pipeline can automatically block execution if recent performance is too bad:
- `--risk-max-drawdown` (default `0.25`)
- `--risk-max-daily-loss` (default `0.08`)

If blocked, it still writes reports/ledger/snapshots and writes an alert JSON under `alerts/`.

## Scheduling (systemd user timer)

Install + enable the daily timer:
```bash
bash Sharpe-Renaissance/scripts/install_paper_trade_systemd_user.sh
```

Logs:
```bash
journalctl --user -u paper-trade.service -n 200 --no-pager
```
