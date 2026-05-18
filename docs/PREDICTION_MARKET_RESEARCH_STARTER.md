# Prediction Market Research Starter

## Working Frame

Prediction-market prices are structured, event-specific expectation measures. A price change is an observable revision in the market-implied probability of a real-world event. The research question is not whether prediction markets are universally predictive, but when those event-probability revisions contain incremental information for matched financial assets.

## Core Research Question

Do prediction-market probability changes predict or explain matched asset returns after controlling for traditional market and sentiment proxies?

Secondary questions:

- Which contract categories carry the clearest signal: macro, regulation, trade, geopolitics, corporate, or direct crypto-price contracts?
- Does the signal survive controls such as Fed funds futures, yields, VIX, and broad market returns?
- Are effects stronger in event windows, high-liquidity contracts, or large probability-shift days?
- Do category-specific signals outperform generic sentiment proxies because they encode specific event beliefs?

## Initial Testable Cores

1. Kalshi macro contracts to rates and macro-sensitive assets.
   - Contracts: FOMC, CPI, unemployment, GDP, recession.
   - Assets: Treasury yields, TLT, GLD, SPY, DXY.
   - Rationale: the event-to-asset channel is most direct.

2. Polymarket crypto policy contracts to crypto assets.
   - Contracts: ETF approvals, SEC/CFTC regulation, enforcement actions, major crypto legislation.
   - Assets: BTC, ETH, SOL, sector proxies where available.
   - Rationale: event-specific regulatory beliefs are poorly captured by generic sentiment.

3. Tariff and trade-policy contracts to sector and FX proxies.
   - Contracts: tariff announcements, trade deals, sanctions, import/export restrictions.
   - Assets: XLI, XLY, DXY, SPY, GLD, oil where relevant.
   - Rationale: less saturated and economically interpretable, but higher uncertainty.

4. Corporate event contracts to individual stocks.
   - Contracts: earnings beats, M&A, bankruptcy, leadership changes.
   - Assets: matched single-name equities.
   - Rationale: potentially strong, but requires strict ticker matching and manual validation.

## Data Plan

Raw archive:

- Polymarket catalogue and price histories.
- Kalshi current and historical market catalogues.
- Kalshi daily candlesticks.
- Contract metadata, rules text, outcome, status, volume, liquidity, timestamps.
- Asset returns from yfinance or a cleaner market-data source later.

Research-grade subset:

- Exclude sports, entertainment, weather, multivariate combo junk, and ultra-short contracts.
- Keep only contracts with clear event-to-asset mapping.
- Require minimum daily observations and nontrivial liquidity.
- Flag direct price contracts separately from event-belief contracts.
- Manually audit the final high-impact sample.

## Baseline Specifications

Panel return regression:

```text
R_asset(i,t+1) = alpha_i + beta * DeltaP_contract(i,t) + controls_t + category FE + error(i,t)
```

Event-window specification:

```text
AR_asset(i,t:t+k) = beta * DeltaP_contract(i,t) + controls + error
```

SWZ-style scaled abnormal return:

```text
AR_scaled = abnormal_return / DeltaP_contract
```

## Key Design Rules

- Pre-specify the sign of each event-to-asset exposure.
- Do not pool categories before showing category-level diagnostics.
- Separate direct price contracts from event contracts.
- Separate prediction-market signal quality from asset-return predictability.
- Treat classification and asset matching as part of the contribution, not a background task.

## Feasibility Gate

Continue toward a paper if at least one core produces:

- Several hundred usable contract-days.
- At least 30-50 distinct economically relevant contracts, or fewer if event windows are very clean.
- Nontrivial probability variation before resolution.
- Plausible asset linkage that survives manual audit.

Downgrade to archive/research note if:

- The clean subset is too thin after filtering.
- Probability histories are mostly settlement jumps.
- Asset mappings are too subjective.
- Results only appear in same-day co-movement and vanish with lags.

## Current Status

Kalshi collection is operational locally. Polymarket public endpoints are blocked from the current network and should be retried from an unblocked machine such as `spectator` once it is online.
