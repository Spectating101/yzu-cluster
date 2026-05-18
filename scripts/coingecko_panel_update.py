#!/usr/bin/env python3
"""
CoinGecko panel updater — keeps the three wide-format data panels current.

Panels updated (all in data_lake/crypto_pipeline/exports/):
  price_panel_clean.csv    — daily USD close price per coin
  mcap_panel_wide.csv      — daily market cap per coin
  volume_panel_wide.csv    — daily total volume per coin

Modes
-----
gap     Use the free public API (market_chart?days=N) to fill in every
        missing date from the last row in the panel up to today.
        One call per coin (~1062 calls total).
        NOTE: use yfinance_gap_fill.py instead — it's faster and has no
        rate-limit issues.  This mode is kept as a CoinGecko-only fallback.

daily   Use the public /coins/markets endpoint (250 coins per request,
        ~5 requests total) to append TODAY's snapshot.  No paid key
        required for the clean universe; the full universe is ~68 requests
        for the current 16k+ column panel. Run this as a daily cron job after
        the paid key is gone.

historical
        Use /coins/{id}/market_chart/range?interval=daily to refresh finalized
        historical daily values over a recent window for the curated clean
        price-panel universe. This is slower than daily mode and is not meant
        to backfill the full 16k+ archived CoinGecko universe on the public API.

Usage
-----
# one-time gap fill (paid key):
python3 scripts/coingecko_panel_update.py --mode gap

# daily cron (free tier):
python3 scripts/coingecko_panel_update.py --mode daily

# full raw-universe daily snapshot:
python3 scripts/coingecko_panel_update.py --mode daily --universe full

# refresh recent clean-panel rows with finalized historical daily data:
python3 scripts/coingecko_panel_update.py --mode historical --refresh-days 45

# dry-run to see what dates would be added:
python3 scripts/coingecko_panel_update.py --mode gap --dry-run

Cron example (runs at 00:30 UTC daily):
  30 0 * * * cd /path/to/Sharpe-Renaissance && python3 scripts/coingecko_panel_update.py --mode daily >> logs/panel_update.log 2>&1
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import json
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# ── paths ────────────────────────────────────────────────────────────────────

_HERE  = Path(__file__).resolve()
_REPO  = _HERE.parents[1]
_EXP   = _REPO / "data_lake" / "crypto_pipeline" / "exports"
_ENV   = _REPO / ".env.local"

PRICE_PANEL = _EXP / "price_panel_clean.csv"
PRICE_PANEL_WIDE = _EXP / "price_panel_wide.csv"
MCAP_PANEL  = _EXP / "mcap_panel_wide.csv"
VOL_PANEL   = _EXP / "volume_panel_wide.csv"

PRO_BASE  = "https://pro-api.coingecko.com/api/v3"
FREE_BASE = "https://api.coingecko.com/api/v3"
DEFAULT_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SharpeRenaissance/1.0"


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()

# ── env / api key ─────────────────────────────────────────────────────────────

def _load_api_key() -> str:
    key = os.environ.get("COINGECKO_API_KEY", "")
    if not key and _ENV.exists():
        for raw_line in _ENV.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if line.startswith("COINGECKO_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'").strip('"')
    return key


def _base_url(api_key: str) -> str:
    return PRO_BASE if api_key else FREE_BASE


# ── http ──────────────────────────────────────────────────────────────────────

def _get(url: str, api_key: str, retries: int = 5, backoff: float = 3.0) -> Any:
    req = urllib.request.Request(url)
    if api_key:
        req.add_header("x-cg-pro-api-key", api_key)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", DEFAULT_USER_AGENT)

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                wait = backoff * (2 ** attempt)
                print(f"    [rate-limit] sleeping {wait:.0f}s", flush=True)
                time.sleep(wait)
            elif exc.code in (502, 503, 504):
                time.sleep(backoff * (attempt + 1))
            else:
                raise
        except (urllib.error.URLError, OSError):
            if attempt == retries:
                raise
            time.sleep(backoff)
    raise RuntimeError(f"Failed after {retries} retries: {url}")


# ── pandas helper ─────────────────────────────────────────────────────────────

def _require_pandas():
    try:
        import pandas as pd
        return pd
    except ImportError:
        print("ERROR: pandas required.  pip install pandas", file=sys.stderr)
        raise SystemExit(1)


# ── panel i/o ─────────────────────────────────────────────────────────────────

def _load_panel(path: Path, pd) -> "pd.DataFrame":
    df = pd.read_csv(path, low_memory=False)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df.set_index("date")


def _save_panel(df: "pd.DataFrame", path: Path, pd):
    df = df.sort_index()
    df.index = df.index.astype(str)  # back to 'YYYY-MM-DD' strings
    df.index.name = "date"
    df.to_csv(path)
    print(f"  Saved {path.name}  ({len(df)} rows × {len(df.columns)} coins)", flush=True)


# ── gap mode ──────────────────────────────────────────────────────────────────

def _hourly_series_to_daily(points: list, pd) -> "pd.Series":
    """Convert [[timestamp_ms, value], ...] → daily series (last value per day)."""
    if not points:
        return pd.Series(dtype=float)
    s = pd.Series(
        {pd.Timestamp(ts, unit="ms", tz="UTC").date(): val for ts, val in points}
    )
    # group by date, keep last
    idx = pd.to_datetime(list(s.index))
    df = pd.DataFrame({"date": idx, "val": s.values})
    daily = df.groupby("date")["val"].last()
    daily.index = daily.index.date
    return daily


def _date_to_unix_seconds(d: date, *, end_of_day: bool = False) -> int:
    dt = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    if end_of_day:
        dt = dt + timedelta(days=1) - timedelta(seconds=1)
    return int(dt.timestamp())


def _series_to_daily(points: list, pd) -> "pd.Series":
    """Convert [[timestamp_ms, value], ...] to daily series using last UTC point per day."""
    if not points:
        return pd.Series(dtype=float)
    df = pd.DataFrame(points, columns=["ts_ms", "val"])
    df["date"] = pd.to_datetime(df["ts_ms"], unit="ms", utc=True).dt.date
    daily = df.groupby("date")["val"].last()
    daily.index = daily.index.astype(object)
    return daily


def run_gap(dry_run: bool = False, use_public_api: bool = False):
    pd = _require_pandas()
    api_key = "" if use_public_api else _load_api_key()
    base    = _base_url(api_key)

    if not api_key:
        print("WARNING: no COINGECKO_API_KEY found — using free public API (slower, lower rate limit)", flush=True)

    # Load panels
    print("Loading panels...", flush=True)
    price_df = _load_panel(PRICE_PANEL, pd)
    mcap_df  = _load_panel(MCAP_PANEL,  pd)
    vol_df   = _load_panel(VOL_PANEL,   pd)

    coins = list(price_df.columns)
    last_date = price_df.index.max()
    today     = _utc_today()

    print(f"Panel last date : {last_date}", flush=True)
    print(f"Today           : {today}", flush=True)

    if last_date >= today:
        print("Panel is already up to date.", flush=True)
        return

    # date range to fill: day after last_date → yesterday (today closes at midnight)
    fill_from = last_date + timedelta(days=1)
    fill_to   = today - timedelta(days=1)   # don't include an incomplete today

    if fill_from > fill_to:
        print("Nothing to fill (only today is missing; run --mode daily instead).", flush=True)
        return

    print(f"Gap to fill     : {fill_from} → {fill_to}  ({(fill_to - fill_from).days + 1} days)", flush=True)

    if dry_run:
        print(f"DRY RUN — would fetch market_chart/range for {len(coins)} coins.", flush=True)
        return

    # new data accumulators  {date: {coin: value}}
    new_price: dict[date, dict[str, float]] = {}
    new_mcap:  dict[date, dict[str, float]] = {}
    new_vol:   dict[date, dict[str, float]] = {}

    # Use market_chart?days=N — one call per coin, works on free API.
    # days=35 ensures we always cover at least 27 days back from today.
    days_back    = (today - last_date).days + 5   # a little buffer
    min_interval = 0.25 if api_key else 2.5
    last_call    = 0.0

    for i, coin in enumerate(coins, 1):
        # throttle
        elapsed = time.monotonic() - last_call
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        url = (
            f"{base}/coins/{coin}/market_chart"
            f"?vs_currency=usd&days={days_back}"
        )
        try:
            data = _get(url, api_key)
            last_call = time.monotonic()
        except Exception as exc:
            print(f"  [{i}/{len(coins)}] SKIP {coin}: {exc}", flush=True)
            last_call = time.monotonic()
            continue

        prices = _hourly_series_to_daily(data.get("prices", []), pd)
        mcaps  = _hourly_series_to_daily(data.get("market_caps", []), pd)
        vols   = _hourly_series_to_daily(data.get("total_volumes", []), pd)

        # Only keep the gap range (don't re-write already-stored dates)
        prices = prices[(prices.index >= fill_from) & (prices.index <= fill_to)]
        mcaps  = mcaps[ (mcaps.index  >= fill_from) & (mcaps.index  <= fill_to)]
        vols   = vols[  (vols.index   >= fill_from) & (vols.index   <= fill_to)]

        for d, v in prices.items():
            new_price.setdefault(d, {})[coin] = v
        for d, v in mcaps.items():
            new_mcap.setdefault(d, {})[coin] = v
        for d, v in vols.items():
            new_vol.setdefault(d, {})[coin] = v

        if i % 100 == 0 or i == len(coins):
            print(f"  {i}/{len(coins)} coins fetched", flush=True)

    # append new rows to panels
    def _append(panel: "pd.DataFrame", new_data: dict) -> "pd.DataFrame":
        if not new_data:
            return panel
        new_rows = pd.DataFrame.from_dict(new_data, orient="index")
        new_rows.index = pd.to_datetime(list(new_rows.index)).date
        # only keep coins already in the panel (ignore new coins from API response)
        extra_cols = [c for c in new_rows.columns if c not in panel.columns]
        if extra_cols:
            new_rows = new_rows.drop(columns=extra_cols)
        return pd.concat([panel, new_rows[panel.columns.intersection(new_rows.columns)]])

    print("\nUpdating panels...", flush=True)
    price_df = _append(price_df, new_price)
    mcap_df  = _append(mcap_df,  new_mcap)
    vol_df   = _append(vol_df,   new_vol)

    _save_panel(price_df, PRICE_PANEL, pd)
    _save_panel(mcap_df,  MCAP_PANEL,  pd)
    _save_panel(vol_df,   VOL_PANEL,   pd)

    print("\nGap fill complete.", flush=True)


# ── historical daily refresh/backfill ────────────────────────────────────────

def run_historical(
    dry_run: bool = False,
    use_public_api: bool = False,
    refresh_days: int = 45,
    from_date: date | None = None,
    to_date: date | None = None,
):
    """Refresh recent rows with finalized daily /market_chart/range data."""
    pd = _require_pandas()
    api_key = "" if use_public_api else _load_api_key()
    base = _base_url(api_key)

    today = _utc_today()
    end = to_date or (today - timedelta(days=1))
    start = from_date or (end - timedelta(days=max(refresh_days - 1, 0)))
    if start > end:
        raise SystemExit(f"ERROR: from-date {start} is after to-date {end}")
    if not api_key and (today - start).days > 365:
        raise SystemExit(
            "ERROR: public CoinGecko historical range access is limited to the past 365 days. "
            "Use --from-date within that window or provide COINGECKO_API_KEY."
        )

    print(f"Historical daily refresh: {start} -> {end}", flush=True)
    if not api_key:
        print("Using public API; keep the range within the past 365 days.", flush=True)

    price_df = _load_panel(PRICE_PANEL, pd)
    mcap_df = _load_panel(MCAP_PANEL, pd)
    vol_df = _load_panel(VOL_PANEL, pd)
    coins = list(price_df.columns)

    if dry_run:
        print(
            f"DRY RUN — would fetch /coins/{{id}}/market_chart/range?interval=daily "
            f"for {len(coins)} clean-panel coins and update rows {start} -> {end}.",
            flush=True,
        )
        return

    new_price: dict[date, dict[str, float]] = {}
    new_mcap: dict[date, dict[str, float]] = {}
    new_vol: dict[date, dict[str, float]] = {}
    failures: list[dict[str, str]] = []

    min_interval = 0.25 if api_key else 2.5
    last_call = 0.0
    from_ts = _date_to_unix_seconds(start)
    to_ts = _date_to_unix_seconds(end, end_of_day=True)

    for i, coin in enumerate(coins, 1):
        elapsed = time.monotonic() - last_call
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        url = (
            f"{base}/coins/{coin}/market_chart/range"
            f"?vs_currency=usd&from={from_ts}&to={to_ts}&interval=daily"
        )
        try:
            data = _get(url, api_key)
            last_call = time.monotonic()
        except Exception as exc:
            failures.append({"coin": coin, "error": str(exc)})
            print(f"  [{i}/{len(coins)}] SKIP {coin}: {exc}", flush=True)
            last_call = time.monotonic()
            continue

        prices = _series_to_daily(data.get("prices", []), pd)
        mcaps = _series_to_daily(data.get("market_caps", []), pd)
        vols = _series_to_daily(data.get("total_volumes", []), pd)

        prices = prices[(prices.index >= start) & (prices.index <= end)]
        mcaps = mcaps[(mcaps.index >= start) & (mcaps.index <= end)]
        vols = vols[(vols.index >= start) & (vols.index <= end)]

        for d, v in prices.items():
            new_price.setdefault(d, {})[coin] = v
        for d, v in mcaps.items():
            new_mcap.setdefault(d, {})[coin] = v
        for d, v in vols.items():
            new_vol.setdefault(d, {})[coin] = v

        if i % 100 == 0 or i == len(coins):
            print(f"  {i}/{len(coins)} coins refreshed", flush=True)

    def _upsert(panel: "pd.DataFrame", new_data: dict[date, dict[str, float]]) -> "pd.DataFrame":
        if not new_data:
            return panel
        new_rows = pd.DataFrame.from_dict(new_data, orient="index")
        new_rows.index = pd.to_datetime(list(new_rows.index)).date
        new_rows = new_rows.reindex(columns=panel.columns)
        combined = panel.copy()
        combined = combined.reindex(combined.index.union(new_rows.index))
        combined.update(new_rows)
        return combined

    print("\nUpserting finalized daily historical rows...", flush=True)
    price_df = _upsert(price_df, new_price)
    mcap_df = _upsert(mcap_df, new_mcap)
    vol_df = _upsert(vol_df, new_vol)

    backup_dir = _EXP.parent / "backups" / f"coingecko_historical_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in (PRICE_PANEL, MCAP_PANEL, VOL_PANEL):
        shutil.copy2(path, backup_dir / path.name)
    print(f"  Backed up existing panels to {backup_dir}", flush=True)

    _save_panel(price_df, PRICE_PANEL, pd)
    _save_panel(mcap_df, MCAP_PANEL, pd)
    _save_panel(vol_df, VOL_PANEL, pd)

    audit_dir = _EXP.parent / "reports"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_dir / "coingecko_historical_refresh_last_run.json"
    audit = {
        "mode": "historical",
        "from_date": str(start),
        "to_date": str(end),
        "coins_requested": len(coins),
        "price_points": sum(len(v) for v in new_price.values()),
        "market_cap_points": sum(len(v) for v in new_mcap.values()),
        "volume_points": sum(len(v) for v in new_vol.values()),
        "backup_dir": str(backup_dir),
        "failures": failures,
    }
    audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(f"\nHistorical refresh complete. Audit: {audit_path}", flush=True)


# ── daily mode (free-tier friendly) ──────────────────────────────────────────

def run_daily(
    dry_run: bool = False,
    use_public_api: bool = False,
    universe: str = "clean",
    min_price_points: int = 0,
):
    """Snapshot today using /coins/markets (250 coins per request, ~5 calls total)."""
    pd = _require_pandas()
    api_key = "" if use_public_api else _load_api_key()
    base    = _base_url(api_key)

    today = _utc_today()
    price_path = PRICE_PANEL_WIDE if universe == "full" else PRICE_PANEL
    print(f"Daily snapshot for {today} ({universe} universe)", flush=True)

    # Check if today already in panel
    price_df = _load_panel(price_path, pd)
    if today in price_df.index:
        print(f"Today ({today}) already in {price_path.name} — nothing to do.", flush=True)
        return

    coins = list(price_df.columns)
    mcap_df = _load_panel(MCAP_PANEL, pd)
    vol_df  = _load_panel(VOL_PANEL,  pd)

    if dry_run:
        print(
            f"DRY RUN — would fetch /coins/markets in {-(-len(coins)//250)} batches "
            f"for {len(coins)} {universe}-universe coins.",
            flush=True,
        )
        return

    today_price: dict[str, float] = {}
    today_mcap:  dict[str, float] = {}
    today_vol:   dict[str, float] = {}

    batch_size   = 250
    min_interval = 0.25 if api_key else 2.5
    last_call    = 0.0

    for start in range(0, len(coins), batch_size):
        batch = coins[start : start + batch_size]
        ids_str = ",".join(batch)

        elapsed = time.monotonic() - last_call
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        url = (
            f"{base}/coins/markets"
            f"?vs_currency=usd&ids={urllib.parse.quote(ids_str)}"
            f"&per_page={batch_size}&page=1&sparkline=false"
        )
        try:
            rows = _get(url, api_key)
            last_call = time.monotonic()
        except Exception as exc:
            print(f"  WARN batch {start//batch_size + 1}: {exc}", flush=True)
            last_call = time.monotonic()
            continue

        for row in rows:
            cid = row.get("id")
            if not cid:
                continue
            if row.get("current_price") is not None:
                today_price[cid] = row["current_price"]
            if row.get("market_cap") is not None:
                today_mcap[cid] = row["market_cap"]
            if row.get("total_volume") is not None:
                today_vol[cid] = row["total_volume"]

        print(f"  Batch {start//batch_size + 1}/{-(-len(coins)//batch_size)} done  ({len(today_price)} coins so far)", flush=True)

    required_points = int(min_price_points)
    if universe == "full" and required_points <= 0:
        required_points = 5_000
    if required_points and len(today_price) < required_points:
        raise SystemExit(
            f"ERROR: fetched only {len(today_price)} prices, below minimum {required_points}; "
            "refusing to append a partial daily row."
        )

    def _append_today(panel: "pd.DataFrame", data: dict) -> "pd.DataFrame":
        # Reindex in one shot to avoid pandas fragmentation from repeated insertions.
        new_row = pd.DataFrame([data], index=pd.Index([today], name="date"))
        new_row = new_row.reindex(columns=panel.columns)
        return pd.concat([panel, new_row])

    print("\nAppending to panels...", flush=True)
    price_df = _append_today(price_df, today_price)
    mcap_df  = _append_today(mcap_df,  today_mcap)
    vol_df   = _append_today(vol_df,   today_vol)

    if universe == "full":
        backup_dir = _EXP.parent / "backups" / f"coingecko_daily_full_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        backup_dir.mkdir(parents=True, exist_ok=True)
        for path in (PRICE_PANEL_WIDE, MCAP_PANEL, VOL_PANEL):
            shutil.copy2(path, backup_dir / path.name)
        print(f"  Backed up existing full panels to {backup_dir}", flush=True)

    _save_panel(price_df, price_path, pd)
    _save_panel(mcap_df,  MCAP_PANEL,  pd)
    _save_panel(vol_df,   VOL_PANEL,   pd)

    audit_dir = _EXP.parent / "reports"
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_dir / "coingecko_daily_update_last_run.json"
    audit = {
        "mode": "daily",
        "universe": universe,
        "date": str(today),
        "coins_requested": len(coins),
        "prices": len(today_price),
        "market_caps": len(today_mcap),
        "volumes": len(today_vol),
        "price_panel": str(price_path),
        "mcap_panel": str(MCAP_PANEL),
        "volume_panel": str(VOL_PANEL),
    }
    audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    print(f"\nDaily snapshot for {today} complete.  "
          f"Prices: {len(today_price)}, Mcap: {len(today_mcap)}, Vol: {len(today_vol)}", flush=True)


# ── cli ───────────────────────────────────────────────────────────────────────

def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--mode",
        choices=["gap", "daily", "historical"],
        required=True,
        help=(
            "gap = fill missing rows; daily = today spot snapshot; "
            "historical = refresh finalized daily rows via market_chart/range"
        ),
    )
    ap.add_argument("--dry-run", action="store_true", help="Show what would happen without making API calls")
    ap.add_argument(
        "--use-public-api",
        action="store_true",
        help="Force the free public CoinGecko API and ignore any COINGECKO_API_KEY from the environment or .env.local",
    )
    ap.add_argument(
        "--refresh-days",
        type=int,
        default=45,
        help="For --mode historical, refresh this many completed days ending at yesterday unless dates are supplied.",
    )
    ap.add_argument(
        "--universe",
        choices=["clean", "full"],
        default="clean",
        help="For --mode daily, clean updates price_panel_clean.csv; full updates price_panel_wide.csv.",
    )
    ap.add_argument(
        "--min-price-points",
        type=int,
        default=0,
        help="For --mode daily, refuse to append if fewer prices are fetched. Full mode defaults to 5000.",
    )
    ap.add_argument("--from-date", type=lambda s: datetime.strptime(s, "%Y-%m-%d").date())
    ap.add_argument("--to-date", type=lambda s: datetime.strptime(s, "%Y-%m-%d").date())
    return ap


def main() -> int:
    args = _parser().parse_args()
    if args.mode == "gap":
        run_gap(dry_run=args.dry_run, use_public_api=args.use_public_api)
    elif args.mode == "daily":
        run_daily(
            dry_run=args.dry_run,
            use_public_api=args.use_public_api,
            universe=args.universe,
            min_price_points=args.min_price_points,
        )
    else:
        run_historical(
            dry_run=args.dry_run,
            use_public_api=args.use_public_api,
            refresh_days=args.refresh_days,
            from_date=args.from_date,
            to_date=args.to_date,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
