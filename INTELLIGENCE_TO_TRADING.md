# Intelligence Oracle → Trading (Integration)

This connects the repo’s “three pillars” intelligence workflow to Sharpe-Renaissance as a **risk/positioning overlay**.

## 1) Generate intelligence artifacts
Signals (RSS):
`python3 scripts/live_monitor.py`

Science verification (optional):
`python3 scripts/bridge_science_verifier.py`

Analyst report (writes `ANALYST_REPORT_*.md`):
`python3 scripts/analyst_bridge.py --max-signals 3 --emit-bundle --bundle-out INTELLIGENCE_BUNDLE.json`

Or normalize separately:
`python3 scripts/normalize_intelligence.py --out INTELLIGENCE_BUNDLE.json`
`python3 scripts/generate_market_context.py --bundle INTELLIGENCE_BUNDLE.json --out MARKET_CONTEXT.json`

## 2) Apply the overlay to a trading protocol
This produces a modified protocol JSON (same schema as dynamic regime protocols), scaling risk by the context:

`python3 Sharpe-Renaissance/scripts/apply_intelligence_overlay.py --protocol-in Sharpe-Renaissance/config/dynamic_regime_protocol_tuned_2025.json --market-context MARKET_CONTEXT.json --protocol-out Sharpe-Renaissance/config/dynamic_regime_protocol_tuned_2025_intel.json`

## 3) Run the protocol and emit a next-day signal
`python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/dynamic_regime_protocol_tuned_2025_intel.json --out-dir Sharpe-Renaissance/backtests/outputs/spy_beater/dynamic_regime_intel_overlay_run`

The next-day holdings suggestion is:
- `.../signal.json`

## What this does (currently)
- Scales `meta.max_gross` by `MARKET_CONTEXT.overlay.meta_max_gross_multiplier`
- Lightly biases `prob_risk_on_enter/exit` based on `recommended_stance`

This is intentionally conservative: it’s a **risk-aware overlay**, not a headline-chasing trading system.

## Optional: “Oracle Alpha Sleeve” (experimental)
This adds a small sleeve (e.g. 5–20%) allocated to Oracle tickers **only if price momentum confirms**.

Example (use the same tidy panel you’re trading on):
`python3 Sharpe-Renaissance/scripts/oracle_alpha_overlay.py --base-signal Sharpe-Renaissance/backtests/outputs/intel/tuned_2025_intel_trading_today/signal.json --bundle INTELLIGENCE_BUNDLE_TRADING.json --market-context MARKET_CONTEXT_TRADING.json --panel Sharpe-Renaissance/data_lake/yfinance_leveraged_crypto_10y.csv --asset-class both --sleeve 0.15 --top-k 2 --out signal_with_oracle_alpha.json`

This writes a merged `signal_with_oracle_alpha.json` that you can paper-trade through the existing executor.

## Staged testing (stocks-only → crypto-only → combined)
Use the Analyst’s final JSON block (`tickers`) to build a tradable universe and test one asset class at a time.

1) Normalize + context:
- `python3 scripts/normalize_intelligence.py --out INTELLIGENCE_BUNDLE.json`
- `python3 scripts/generate_market_context.py --bundle INTELLIGENCE_BUNDLE.json --out MARKET_CONTEXT.json`

2) Build a universe file:
- Stocks-only: `python3 Sharpe-Renaissance/scripts/build_universe_from_intelligence.py --bundle INTELLIGENCE_BUNDLE.json --asset-class stocks --include SPY BIL --out Sharpe-Renaissance/config/universes/intel_stocks.txt`
- Crypto-only: `python3 Sharpe-Renaissance/scripts/build_universe_from_intelligence.py --bundle INTELLIGENCE_BUNDLE.json --asset-class crypto --include BTC-USD ETH-USD BIL --out Sharpe-Renaissance/config/universes/intel_crypto.txt`

3) Build protocol JSONs from that universe:
- `python3 Sharpe-Renaissance/scripts/build_dynamic_regime_market_configs.py --universe Sharpe-Renaissance/config/universes/intel_stocks.txt --mode stocks --panel Sharpe-Renaissance/data_lake/yfinance_panel.csv --name intel_stocks`
- `python3 Sharpe-Renaissance/scripts/build_dynamic_regime_market_configs.py --universe Sharpe-Renaissance/config/universes/intel_crypto.txt --mode crypto --panel Sharpe-Renaissance/data_lake/yfinance_panel.csv --name intel_crypto`

4) Apply the market-context overlay and run:
- `python3 Sharpe-Renaissance/scripts/apply_intelligence_overlay.py --protocol-in Sharpe-Renaissance/config/generated/intel_stocks/intel_stocks_stocks_protocol.json --market-context MARKET_CONTEXT.json --protocol-out Sharpe-Renaissance/config/generated/intel_stocks/intel_stocks_stocks_protocol_intel.json`
- `python3 Sharpe-Renaissance/scripts/run_dynamic_regime_protocol.py --protocol-json Sharpe-Renaissance/config/generated/intel_stocks/intel_stocks_stocks_protocol_intel.json --out-dir Sharpe-Renaissance/backtests/outputs/intel/stocks_run`
