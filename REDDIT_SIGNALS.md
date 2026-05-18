# Reddit Daily Signals (Backtestable Panel)

This repo already includes a lightweight Reddit fetcher and sentiment tooling. The new “daily signals” builder turns Reddit posts into a **numeric daily feature table** keyed by `Date, Ticker` so you can run event studies / backtests.

## Recommended: daily ingestion pipeline (raw + SQLite index + panel)

This is the non-destructive, repeatable way to build a dataset over time:

```bash
python3 Sharpe-Renaissance/scripts/reddit_ingest_daily.py \
  --subreddits wallstreetbets stocks investing options CryptoCurrency \
  --sort new --max-pages 10 --sleep-secs 1.2 \
  --comments-max-posts 50 --comments-lookback-hours 24 \
  --min-upvotes 0
```

What it does:
- Writes **raw JSONL** into `Sharpe-Renaissance/data_lake/sentiment/reddit/raw/YYYY-MM-DD/{posts,comments}.jsonl`
- Updates a local **SQLite index** at `Sharpe-Renaissance/data_lake/sentiment/reddit_ingest.sqlite` (dedupe across runs)
- Appends/merges the **daily panel** into `Sharpe-Renaissance/data_lake/sentiment/reddit_daily_signals.parquet`

Scheduling (cron example, runs every day at 18:10 UTC):
```bash
crontab -e
# add:
10 18 * * * cd /path/to/Molina-Optiplex && python3 Sharpe-Renaissance/scripts/reddit_ingest_daily.py --subreddits wallstreetbets stocks investing options --max-pages 10 --comments-max-posts 50 >> Sharpe-Renaissance/data_lake/sentiment/reddit_ingest.log 2>&1
```

### Scheduling (systemd user timer, recommended on Linux)

This repo ships a user-level systemd timer template under `Sharpe-Renaissance/systemd/`.

Install (writes to `~/.config/systemd/user/` and enables the timer):
```bash
bash Sharpe-Renaissance/scripts/install_reddit_systemd_user.sh
```

Change schedule:
- Edit `~/.config/systemd/user/reddit-ingest.timer` (`OnCalendar=...`), then:
  - `systemctl --user daemon-reload`
  - `systemctl --user restart reddit-ingest.timer`

View logs:
- `journalctl --user -u reddit-ingest.service -n 200 --no-pager`

### More thorough coverage

Public endpoints are limited, but you can widen coverage by pulling multiple “modes” in one run:

```bash
python3 Sharpe-Renaissance/scripts/reddit_ingest_daily.py \
  --subreddits wallstreetbets stocks investing options \
  --fetch-modes new hot top:day top:week \
  --max-pages 10 --sleep-secs 1.2 \
  --comments-max-posts 75 --comments-lookback-hours 48
```

## 1) Fetch recent posts (public endpoints)

Writes JSONL with fields including `created_utc`, `subreddit`, `author`, `score`, `title`, `selftext`.

```bash
python3 Sharpe-Renaissance/scripts/reddit_fetch_listing_jsonl.py \
  --subreddits wallstreetbets stocks investing algotrading CryptoCurrency \
  --sort new --limit 100 --max-pages 10 --sleep-secs 1.2 \
  --out Sharpe-Renaissance/data_lake/sentiment/reddit_recent.jsonl
```

Notes:
- Public listing endpoints only provide **recent** history. To build long history, run this daily and append (`--append`).

## 1.5) Fetch comments (optional, higher signal)

This pulls comment bodies for a subset of the fetched posts using public thread JSON endpoints like:

`https://www.reddit.com/r/<subreddit>/comments/<post_id>.json`

```bash
python3 Sharpe-Renaissance/scripts/reddit_fetch_comments_jsonl.py \
  --in-posts-jsonl Sharpe-Renaissance/data_lake/sentiment/reddit_recent.jsonl \
  --max-posts 25 \
  --sleep-secs 1.2 \
  --out Sharpe-Renaissance/data_lake/sentiment/reddit_comments_recent.jsonl
```

Output: JSONL with (at minimum) `created_utc`, `subreddit`, `author`, `score`, `body`, and per-thread identifiers like `post_id`, `parent_id`.

## 2) Build daily ticker signals (Parquet + CSV)

```bash
python3 Sharpe-Renaissance/scripts/reddit_daily_signals.py \
  --in-jsonl Sharpe-Renaissance/data_lake/sentiment/reddit_recent.jsonl \
  --tickers-file Sharpe-Renaissance/config/tickers_reddit_nasdaq100_plus_spy.txt \
  --out Sharpe-Renaissance/data_lake/sentiment/reddit_daily_signals.parquet \
  --append
```

### Optional: include comments (higher signal)

Fetch a small slice of comments for the most recent posts:

```bash
python3 Sharpe-Renaissance/scripts/reddit_fetch_comments_jsonl.py \
  --in-posts-jsonl Sharpe-Renaissance/data_lake/sentiment/reddit_recent.jsonl \
  --max-posts 25 \
  --out Sharpe-Renaissance/data_lake/sentiment/reddit_comments_recent.jsonl
```

Then rebuild the panel using both files:

```bash
python3 Sharpe-Renaissance/scripts/reddit_daily_signals.py \
  --in-jsonl Sharpe-Renaissance/data_lake/sentiment/reddit_recent.jsonl Sharpe-Renaissance/data_lake/sentiment/reddit_comments_recent.jsonl \
  --tickers-file Sharpe-Renaissance/config/tickers_reddit_nasdaq100_plus_spy.txt \
  --out Sharpe-Renaissance/data_lake/sentiment/reddit_daily_signals.parquet \
  --append
```

Output columns:
- `mention_posts`, `mention_occurrences`
- `unique_authors`
- `upvote_weighted_mentions`
- `sentiment_mean`, `sentiment_upvote_weighted`
- `novelty_30d_ratio`, `novelty_30d_z` (computed using a trailing window via `shift(1)` to avoid lookahead)

## Diagnostics / troubleshooting

- If comment fetch returns `n_threads_ok: 0`, ensure the thread URL ends with `.json` (the script now enforces this from the permalink).
- If you see a lot of `VisualMod` comments, that’s normal for WSB; you can filter bot authors in analysis later if desired.
- For more history, schedule daily runs and keep appending/merging via `--append`.
- For X/Twitter ingestion (official API), see `Sharpe-Renaissance/X_SIGNALS.md`.

## 3) Backtest integration

`Sharpe-Renaissance/scripts/reddit_alpha_backtest.py` now accepts either:
- the legacy CSV sentiment panel (`Date,Ticker,Mentions,Weight,Sentiment`), or
- the new Parquet daily signals panel (`Date,Ticker,mention_posts,upvote_weighted_mentions,sentiment_mean,...`).
