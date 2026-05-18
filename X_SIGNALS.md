# X (Twitter) Signals (Official API) → Daily Ticker Panel

This repo supports ingesting X posts (via the official X API v2) and turning them into the same backtestable daily feature panel used for Reddit:

- Raw ingestion: date-stamped JSONL (non-destructive)
- Optional SQLite index for dedupe + provenance
- Daily ticker signals: `Date,Ticker,...` (Parquet) using `scripts/reddit_daily_signals.py`

## Requirements

You need an X API bearer token with access to:
- `GET /2/tweets/search/recent`

Provide it via `--bearer-token` or env var `X_BEARER_TOKEN`.

## 1) Ingest daily raw tweets (recommended)

Writes:
- `Sharpe-Renaissance/data_lake/sentiment/x/raw/YYYY-MM-DD/tweets.jsonl`
- `Sharpe-Renaissance/data_lake/sentiment/x_ingest.sqlite`

```bash
export X_BEARER_TOKEN="..."

python3 Sharpe-Renaissance/scripts/x_ingest_daily.py \
  --query '($TSLA OR TSLA OR $NVDA OR NVDA) (earnings OR guidance OR upgrade OR downgrade)' \
  --max-pages 5 --max-results 100 --sleep-secs 1.0
```

Notes:
- This uses the official API; it does not attempt to bypass access restrictions.
- Recent search is still “recent” (not full archive) unless your plan includes expanded access.

## 2) Build/update the daily ticker signals panel

Point the panel builder at the day’s raw tweets JSONL:

```bash
python3 Sharpe-Renaissance/scripts/reddit_daily_signals.py \
  --in-jsonl Sharpe-Renaissance/data_lake/sentiment/x/raw/$(date -u +%F)/tweets.jsonl \
  --tickers-file Sharpe-Renaissance/config/tickers_reddit_nasdaq100_plus_spy.txt \
  --out Sharpe-Renaissance/data_lake/sentiment/x_daily_signals.parquet \
  --append
```

If you want a combined panel (Reddit + X), pass both JSONL sources to the same run:

```bash
python3 Sharpe-Renaissance/scripts/reddit_daily_signals.py \
  --in-jsonl \
    Sharpe-Renaissance/data_lake/sentiment/reddit/raw/$(date -u +%F)/posts.jsonl \
    Sharpe-Renaissance/data_lake/sentiment/reddit/raw/$(date -u +%F)/comments.jsonl \
    Sharpe-Renaissance/data_lake/sentiment/x/raw/$(date -u +%F)/tweets.jsonl \
  --tickers-file Sharpe-Renaissance/config/tickers_reddit_nasdaq100_plus_spy.txt \
  --out Sharpe-Renaissance/data_lake/sentiment/altdata_daily_signals.parquet \
  --append
```

