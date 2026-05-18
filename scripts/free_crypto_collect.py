#!/usr/bin/env python3
"""
No-cost crypto data collector.

Sources:
- CoinPaprika (free): coins, market snapshot, coin metadata, exchanges
- CryptoCompare (free): historical daily OHLCV (USD) by symbol

Output:
- SQLite database with normalized tables for downstream analysis.
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DB_PATH = Path("data/crypto/free/free_crypto_dump.sqlite3")
COINPAPRIKA_BASE = "https://api.coinpaprika.com/v1"
CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_utc_to_unix(value: str) -> int:
    v = (value or "").strip().lower()
    if v == "now":
        return int(time.time())
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def slugify(value: str) -> str:
    out = []
    for ch in (value or "").lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "unknown"


@dataclass
class JsonHttpClient:
    base_url: str
    timeout_s: int = 30
    min_interval_s: float = 0.35
    max_retries: int = 4
    retry_backoff_s: float = 2.0
    _last_request_mono: float = 0.0

    def _wait_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request_mono
        wait_s = self.min_interval_s - elapsed
        if wait_s > 0:
            time.sleep(wait_s)

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query = urllib.parse.urlencode({k: str(v) for k, v in (params or {}).items() if v is not None})
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{query}"

        for attempt in range(self.max_retries + 1):
            self._wait_slot()
            req = urllib.request.Request(url=url, method="GET")
            req.add_header("Accept", "application/json")
            req.add_header(
                "User-Agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            req.add_header("Accept-Language", "en-US,en;q=0.9")
            payload = ""
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    payload = resp.read().decode("utf-8", errors="replace")
                return json.loads(payload)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                if exc.code in {408, 429, 500, 502, 503} and attempt < self.max_retries:
                    sleep_s = self.retry_backoff_s * (2**attempt)
                    print(
                        f"[retry] HTTP {exc.code} url={url} attempt={attempt + 1}/{self.max_retries} wait={sleep_s:.1f}s",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(sleep_s)
                    continue
                raise RuntimeError(f"HTTP {exc.code} for {url}: {body[:350]}") from exc
            except urllib.error.URLError as exc:
                if attempt < self.max_retries:
                    sleep_s = self.retry_backoff_s * (2**attempt)
                    print(
                        f"[retry] network url={url} attempt={attempt + 1}/{self.max_retries} wait={sleep_s:.1f}s err={exc}",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(sleep_s)
                    continue
                raise RuntimeError(f"Network error for {url}: {exc}") from exc
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"Non-JSON response for {url}: {payload[:350]}") from exc
            finally:
                self._last_request_mono = time.monotonic()

        raise RuntimeError(f"Request retries exhausted for {url}")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS ingest_runs (
            run_id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            args_json TEXT NOT NULL,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS categories (
            category_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source TEXT NOT NULL,
            retrieved_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS coins (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            rank INTEGER,
            coin_type TEXT,
            is_active INTEGER NOT NULL,
            source TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            retrieved_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS coin_category_map (
            coin_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            source TEXT NOT NULL,
            PRIMARY KEY (coin_id, category_id, source)
        );

        CREATE TABLE IF NOT EXISTS coin_markets (
            coin_id TEXT NOT NULL,
            retrieved_at TEXT NOT NULL,
            current_price REAL,
            market_cap REAL,
            total_volume REAL,
            market_cap_rank INTEGER,
            source TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            PRIMARY KEY (coin_id, retrieved_at, source)
        );

        CREATE TABLE IF NOT EXISTS coin_details (
            coin_id TEXT NOT NULL,
            source TEXT NOT NULL,
            links_json TEXT NOT NULL,
            image_url TEXT,
            categories_json TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (coin_id, source)
        );

        CREATE TABLE IF NOT EXISTS coin_history (
            coin_id TEXT NOT NULL,
            ts_ms INTEGER NOT NULL,
            price REAL,
            market_cap REAL,
            total_volume REAL,
            source TEXT NOT NULL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (coin_id, ts_ms, source)
        );

        CREATE TABLE IF NOT EXISTS exchanges (
            exchange_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            active INTEGER NOT NULL,
            confidence_score REAL,
            source TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            retrieved_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exchange_details (
            exchange_id TEXT NOT NULL,
            source TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            retrieved_at TEXT NOT NULL,
            PRIMARY KEY (exchange_id, source)
        );

        CREATE TABLE IF NOT EXISTS failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            item_id TEXT,
            error TEXT NOT NULL,
            occurred_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def log_failure(conn: sqlite3.Connection, endpoint: str, item_id: str | None, error: str) -> None:
    conn.execute(
        "INSERT INTO failures(endpoint, item_id, error, occurred_at) VALUES (?, ?, ?, ?)",
        (endpoint, item_id, error[:2000], utc_now_iso()),
    )
    conn.commit()


def upsert_coin(conn: sqlite3.Connection, row: dict[str, Any], fetched_at: str) -> None:
    conn.execute(
        """
        INSERT INTO coins(id, symbol, name, rank, coin_type, is_active, source, raw_json, retrieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          symbol=excluded.symbol,
          name=excluded.name,
          rank=excluded.rank,
          coin_type=excluded.coin_type,
          is_active=excluded.is_active,
          source=excluded.source,
          raw_json=excluded.raw_json,
          retrieved_at=excluded.retrieved_at
        """,
        (
            str(row.get("id") or ""),
            str(row.get("symbol") or ""),
            str(row.get("name") or ""),
            row.get("rank"),
            str(row.get("type") or ""),
            1 if bool(row.get("is_active", True)) else 0,
            "coinpaprika",
            json.dumps(row, ensure_ascii=False),
            fetched_at,
        ),
    )


def insert_market_snapshot(conn: sqlite3.Connection, rows: Iterable[dict[str, Any]], fetched_at: str) -> int:
    payload = []
    for row in rows:
        coin_id = str(row.get("id") or "")
        if not coin_id:
            continue
        usd = (row.get("quotes") or {}).get("USD") or {}
        payload.append(
            (
                coin_id,
                fetched_at,
                usd.get("price"),
                usd.get("market_cap"),
                usd.get("volume_24h"),
                row.get("rank"),
                "coinpaprika",
                json.dumps(row, ensure_ascii=False),
            )
        )
    conn.executemany(
        """
        INSERT OR REPLACE INTO coin_markets(
          coin_id, retrieved_at, current_price, market_cap, total_volume, market_cap_rank, source, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        payload,
    )
    return len(payload)


def upsert_coin_detail(conn: sqlite3.Connection, coin_id: str, detail: dict[str, Any], fetched_at: str) -> None:
    tags = detail.get("tags") or []
    categories = [str(t.get("name") or "") for t in tags if isinstance(t, dict) and t.get("name")]
    conn.execute(
        """
        INSERT INTO coin_details(coin_id, source, links_json, image_url, categories_json, raw_json, retrieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(coin_id, source) DO UPDATE SET
          links_json=excluded.links_json,
          image_url=excluded.image_url,
          categories_json=excluded.categories_json,
          raw_json=excluded.raw_json,
          retrieved_at=excluded.retrieved_at
        """,
        (
            coin_id,
            "coinpaprika",
            json.dumps(detail.get("links") or {}, ensure_ascii=False),
            detail.get("logo"),
            json.dumps(categories, ensure_ascii=False),
            json.dumps(detail, ensure_ascii=False),
            fetched_at,
        ),
    )

    for tag in tags:
        if not isinstance(tag, dict):
            continue
        name = str(tag.get("name") or "").strip()
        if not name:
            continue
        raw_id = str(tag.get("id") or "")
        category_id = f"coinpaprika:{raw_id or slugify(name)}"
        conn.execute(
            """
            INSERT INTO categories(category_id, name, source, retrieved_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(category_id) DO UPDATE SET
              name=excluded.name,
              source=excluded.source,
              retrieved_at=excluded.retrieved_at
            """,
            (category_id, name, "coinpaprika", fetched_at),
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO coin_category_map(coin_id, category_id, source)
            VALUES (?, ?, ?)
            """,
            (coin_id, category_id, "coinpaprika"),
        )


def insert_history_points(
    conn: sqlite3.Connection, coin_id: str, rows: Iterable[dict[str, Any]], fetched_at: str
) -> int:
    payload = []
    for row in rows:
        ts = row.get("time")
        if ts is None:
            continue
        payload.append(
            (
                coin_id,
                int(ts) * 1000,
                row.get("close"),
                None,
                row.get("volumeto"),
                "cryptocompare",
                fetched_at,
            )
        )
    conn.executemany(
        """
        INSERT INTO coin_history(coin_id, ts_ms, price, market_cap, total_volume, source, retrieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(coin_id, ts_ms, source) DO UPDATE SET
          price=excluded.price,
          market_cap=excluded.market_cap,
          total_volume=excluded.total_volume,
          retrieved_at=excluded.retrieved_at
        """,
        payload,
    )
    return len(payload)


def upsert_exchange(conn: sqlite3.Connection, row: dict[str, Any], fetched_at: str) -> None:
    ex_id = str(row.get("id") or "")
    if not ex_id:
        return
    conn.execute(
        """
        INSERT INTO exchanges(exchange_id, name, active, confidence_score, source, raw_json, retrieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(exchange_id) DO UPDATE SET
          name=excluded.name,
          active=excluded.active,
          confidence_score=excluded.confidence_score,
          source=excluded.source,
          raw_json=excluded.raw_json,
          retrieved_at=excluded.retrieved_at
        """,
        (
            ex_id,
            str(row.get("name") or ""),
            1 if bool(row.get("active", True)) else 0,
            row.get("confidence_score"),
            "coinpaprika",
            json.dumps(row, ensure_ascii=False),
            fetched_at,
        ),
    )


def upsert_exchange_detail(conn: sqlite3.Connection, ex_id: str, detail: dict[str, Any], fetched_at: str) -> None:
    conn.execute(
        """
        INSERT INTO exchange_details(exchange_id, source, raw_json, retrieved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(exchange_id, source) DO UPDATE SET
          raw_json=excluded.raw_json,
          retrieved_at=excluded.retrieved_at
        """,
        (ex_id, "coinpaprika", json.dumps(detail, ensure_ascii=False), fetched_at),
    )


def fetch_cryptocompare_histoday(
    client: JsonHttpClient, symbol: str, start_ts: int, end_ts: int
) -> list[dict[str, Any]]:
    all_rows: dict[int, dict[str, Any]] = {}
    to_ts = end_ts
    start_day = start_ts - (start_ts % 86400)

    while True:
        days = max(1, math.ceil((to_ts - start_ts) / 86400) + 2)
        limit = min(2000, days)
        payload = client.get(
            "/histoday",
            {"fsym": symbol, "tsym": "USD", "limit": limit, "toTs": max(to_ts, start_ts)},
        )
        if not isinstance(payload, dict):
            raise RuntimeError("CryptoCompare response is not an object")
        if payload.get("Response") != "Success":
            raise RuntimeError(str(payload.get("Message") or "CryptoCompare call failed"))

        rows = (((payload.get("Data") or {}).get("Data")) or [])
        if not isinstance(rows, list) or not rows:
            break

        oldest = None
        for row in rows:
            if not isinstance(row, dict):
                continue
            ts = int(row.get("time", 0))
            if ts <= 0:
                continue
            if ts < start_day or ts > end_ts:
                continue
            all_rows[ts] = row
            oldest = ts if oldest is None else min(oldest, ts)

        if oldest is None or oldest <= start_day:
            break
        next_to_ts = oldest - 86400
        if next_to_ts >= to_ts:
            break
        to_ts = next_to_ts

    return [all_rows[k] for k in sorted(all_rows.keys())]


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Collect no-cost crypto market data into SQLite.")
    ap.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    ap.add_argument("--coins-limit", type=int, default=100, help="Top ranked coins to fetch details/history for.")
    ap.add_argument("--exchange-limit", type=int, default=200, help="Number of exchanges to fetch detail for.")
    ap.add_argument("--history-from", default="2025-01-01T00:00:00+00:00")
    ap.add_argument("--history-to", default="now")
    ap.add_argument("--skip-coin-details", action="store_true")
    ap.add_argument("--skip-history", action="store_true")
    ap.add_argument("--skip-exchanges", action="store_true")
    ap.add_argument("--timeout-seconds", type=int, default=30)
    ap.add_argument("--min-interval-seconds", type=float, default=0.35)
    ap.add_argument("--max-retries", type=int, default=4)
    ap.add_argument("--retry-backoff-seconds", type=float, default=2.0)
    return ap


def main() -> int:
    args = build_parser().parse_args()
    args.db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(args.db_path))
    conn.row_factory = sqlite3.Row
    init_db(conn)

    run_id = f"free-{int(time.time())}"
    conn.execute(
        "INSERT INTO ingest_runs(run_id, started_at, status, args_json) VALUES (?, ?, ?, ?)",
        (run_id, utc_now_iso(), "running", json.dumps(vars(args), default=str, ensure_ascii=False)),
    )
    conn.commit()

    paprika = JsonHttpClient(
        base_url=COINPAPRIKA_BASE,
        timeout_s=int(args.timeout_seconds),
        min_interval_s=float(args.min_interval_seconds),
        max_retries=int(args.max_retries),
        retry_backoff_s=float(args.retry_backoff_seconds),
    )
    cryptocompare = JsonHttpClient(
        base_url=CRYPTOCOMPARE_BASE,
        timeout_s=int(args.timeout_seconds),
        min_interval_s=max(0.5, float(args.min_interval_seconds)),
        max_retries=int(args.max_retries),
        retry_backoff_s=float(args.retry_backoff_seconds),
    )

    try:
        fetched_at = utc_now_iso()
        coins = paprika.get("/coins")
        if not isinstance(coins, list):
            raise RuntimeError("CoinPaprika /coins did not return a list")
        for row in coins:
            if isinstance(row, dict):
                upsert_coin(conn, row, fetched_at)
        conn.commit()
        print(f"[ok] coins={len(coins)}", flush=True)

        tickers = paprika.get("/tickers")
        if not isinstance(tickers, list):
            raise RuntimeError("CoinPaprika /tickers did not return a list")
        market_rows = [r for r in tickers if isinstance(r, dict)]
        inserted = insert_market_snapshot(conn, market_rows, fetched_at)
        conn.commit()
        print(f"[ok] market_rows={inserted}", flush=True)

        ranked = sorted(
            market_rows,
            key=lambda r: int(r.get("rank") or 10**9),
        )
        selected = ranked[: max(0, int(args.coins_limit))]

        if not args.skip_coin_details:
            for idx, row in enumerate(selected, start=1):
                coin_id = str(row.get("id") or "")
                if not coin_id:
                    continue
                try:
                    detail = paprika.get(f"/coins/{urllib.parse.quote(coin_id, safe='')}")
                    if not isinstance(detail, dict):
                        raise RuntimeError("detail response is not an object")
                    upsert_coin_detail(conn, coin_id, detail, utc_now_iso())
                    if idx % 25 == 0:
                        conn.commit()
                    print(f"[detail] {idx}/{len(selected)} {coin_id}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] detail failed coin={coin_id} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "coinpaprika:/coins/{id}", coin_id, err)
            conn.commit()

        if not args.skip_history:
            start_ts = parse_utc_to_unix(args.history_from)
            end_ts = parse_utc_to_unix(args.history_to)
            hist_points = 0
            for idx, row in enumerate(selected, start=1):
                coin_id = str(row.get("id") or "")
                symbol = str(row.get("symbol") or "").upper()
                if not coin_id or not symbol:
                    continue
                try:
                    rows = fetch_cryptocompare_histoday(cryptocompare, symbol, start_ts, end_ts)
                    hist_points += insert_history_points(conn, coin_id, rows, utc_now_iso())
                    if idx % 20 == 0:
                        conn.commit()
                    print(f"[history] {idx}/{len(selected)} {coin_id} points={len(rows)}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] history failed coin={coin_id} symbol={symbol} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "cryptocompare:/histoday", coin_id, err)
            conn.commit()
            print(f"[ok] history_points={hist_points}", flush=True)

        if not args.skip_exchanges:
            exchanges = paprika.get("/exchanges")
            if not isinstance(exchanges, list):
                raise RuntimeError("CoinPaprika /exchanges did not return a list")
            ex_rows = [r for r in exchanges if isinstance(r, dict)]
            for row in ex_rows:
                upsert_exchange(conn, row, utc_now_iso())
            conn.commit()
            print(f"[ok] exchanges={len(ex_rows)}", flush=True)

            ex_ids = [str(r.get("id") or "") for r in ex_rows if r.get("id")]
            if args.exchange_limit > 0:
                ex_ids = ex_ids[: int(args.exchange_limit)]
            for idx, ex_id in enumerate(ex_ids, start=1):
                try:
                    detail = paprika.get(f"/exchanges/{urllib.parse.quote(ex_id, safe='')}")
                    if not isinstance(detail, dict):
                        raise RuntimeError("exchange detail is not an object")
                    upsert_exchange_detail(conn, ex_id, detail, utc_now_iso())
                    if idx % 25 == 0:
                        conn.commit()
                    print(f"[exchange] {idx}/{len(ex_ids)} {ex_id}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] exchange detail failed id={ex_id} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "coinpaprika:/exchanges/{id}", ex_id, err)
            conn.commit()

        conn.execute(
            "UPDATE ingest_runs SET completed_at=?, status=?, note=? WHERE run_id=?",
            (utc_now_iso(), "done", "success", run_id),
        )
        conn.commit()
    except Exception as exc:
        conn.execute(
            "UPDATE ingest_runs SET completed_at=?, status=?, note=? WHERE run_id=?",
            (utc_now_iso(), "failed", str(exc)[:2000], run_id),
        )
        conn.commit()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    print(f"✅ Completed run_id={run_id} db={args.db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
