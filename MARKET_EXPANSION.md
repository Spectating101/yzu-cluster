# Market Expansion: Taiwan / Vietnam / Indonesia

This repo’s “dynamic regime” signal generator is market-agnostic as long as you provide a tidy daily panel.

## 1) Build price panels (yfinance proxies)
The fastest path is to start with US-listed proxies (ETFs/ADRs) for each market:

`python3 Sharpe-Renaissance/scripts/build_market_panels.py --market all --period 10y`

Outputs:
- `Sharpe-Renaissance/data_lake/markets/taiwan_10y.csv`
- `Sharpe-Renaissance/data_lake/markets/vietnam_10y.csv`
- `Sharpe-Renaissance/data_lake/markets/indonesia_10y.csv`

Ticker lists (edit to taste):
- `Sharpe-Renaissance/config/markets/taiwan.tickers.txt`
- `Sharpe-Renaissance/config/markets/vietnam.tickers.txt`
- `Sharpe-Renaissance/config/markets/indonesia.tickers.txt`

## 2) Run market-specific protocols
Each market has a protocol JSON:
- `Sharpe-Renaissance/config/dynamic_regime_protocol_taiwan.json` (benchmark `EWT`)
- `Sharpe-Renaissance/config/dynamic_regime_protocol_vietnam.json` (benchmark `VNM`)
- `Sharpe-Renaissance/config/dynamic_regime_protocol_indonesia.json` (benchmark `EIDO`)

Example (Taiwan):

`python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_taiwan.json --out-dir Sharpe-Renaissance/backtests/outputs/markets/taiwan_run`

## 3) Evaluate a year slice (no-lookahead within the runner)
`python3 Sharpe-Renaissance/scripts/eval_year_slice_dynamic_regime.py --run-dir Sharpe-Renaissance/backtests/outputs/markets/taiwan_run --year 2025 --launch-date 2025-01-01`

## Notes / Limitations
- These are proxies; if you want *true* local-market portfolios, swap in local tickers + a real data provider.
- yfinance coverage can be spotty for some local tickers; the panel builder will simply skip tickers that return no data.

