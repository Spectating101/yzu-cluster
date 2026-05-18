#!/usr/bin/env python3
"""
No-cost crypto collector (CoinLore + CryptoCompare).

Purpose:
- Provide a fallback full-ingestion path when CoinPaprika is blocked/rate-limited.
- Collect coins, market snapshot, coin socials, history, and exchanges.
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


DEFAULT_DB_PATH = Path("data/crypto/free/full_coinlore.sqlite3")
COINLORE_BASE = "https://api.coinlore.net/api"
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


def to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def to_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except Exception:
        return None


@dataclass
class JsonHttpClient:
    base_url: str
    timeout_s: int = 30
    min_interval_s: float = 0.1
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
                    wait_s = self.retry_backoff_s * (2**attempt)
                    print(
                        f"[retry] HTTP {exc.code} url={url} attempt={attempt + 1}/{self.max_retries} wait={wait_s:.1f}s",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(wait_s)
                    continue
                raise RuntimeError(f"HTTP {exc.code} for {url}: {body[:350]}") from exc
            except urllib.error.URLError as exc:
                if attempt < self.max_retries:
                    wait_s = self.retry_backoff_s * (2**attempt)
                    print(
                        f"[retry] network url={url} attempt={attempt + 1}/{self.max_retries} wait={wait_s:.1f}s err={exc}",
                        file=sys.stderr,
                        flush=True,
                    )
                    time.sleep(wait_s)
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


def fetch_all_coinlore_tickers(client: JsonHttpClient, page_size: int = 100) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []
    start = 0
    total = None
    while True:
        payload = client.get("/tickers/", {"start": start, "limit": page_size})
        if not isinstance(payload, dict):
            raise RuntimeError("CoinLore /tickers response is not an object")
        rows = payload.get("data") or []
        if not isinstance(rows, list):
            raise RuntimeError("CoinLore /tickers data is not a list")
        all_rows.extend([r for r in rows if isinstance(r, dict)])

        info = payload.get("info") or {}
        total = to_int(info.get("coins_num")) or total
        print(f"[tickers] start={start} page_rows={len(rows)} total_collected={len(all_rows)}", flush=True)
        if len(rows) < page_size:
            break
        start += page_size
        if total is not None and start >= total:
            break
    return all_rows


def upsert_coin(conn: sqlite3.Connection, row: dict[str, Any], fetched_at: str) -> None:
    coin_id = f"coinlore:{row.get('id')}"
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
            coin_id,
            str(row.get("symbol") or ""),
            str(row.get("name") or ""),
            to_int(row.get("rank")),
            "coin",
            1,
            "coinlore",
            json.dumps(row, ensure_ascii=False),
            fetched_at,
        ),
    )


def insert_market_snapshot(conn: sqlite3.Connection, rows: Iterable[dict[str, Any]], fetched_at: str) -> int:
    payload = []
    for row in rows:
        coin_id = f"coinlore:{row.get('id')}"
        payload.append(
            (
                coin_id,
                fetched_at,
                to_float(row.get("price_usd")),
                to_float(row.get("market_cap_usd")),
                to_float(row.get("volume24")),
                to_int(row.get("rank")),
                "coinlore",
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


def upsert_coin_detail(
    conn: sqlite3.Connection,
    coinlore_id: str,
    coin_key: str,
    ticker_row: dict[str, Any],
    social_row: dict[str, Any],
    fetched_at: str,
) -> None:
    links = {
        "twitter": social_row.get("twitter") if isinstance(social_row.get("twitter"), dict) else {},
        "reddit": social_row.get("reddit") if isinstance(social_row.get("reddit"), dict) else {},
    }
    raw = {"ticker": ticker_row, "social": social_row}
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
            coin_key,
            "coinlore",
            json.dumps(links, ensure_ascii=False),
            None,
            json.dumps([], ensure_ascii=False),
            json.dumps(raw, ensure_ascii=False),
            fetched_at,
        ),
    )


def upsert_exchange(conn: sqlite3.Connection, ex_id: str, row: dict[str, Any], fetched_at: str) -> None:
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
            f"coinlore:{ex_id}",
            str(row.get("name") or ""),
            1,
            None,
            "coinlore",
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
        (f"coinlore:{ex_id}", "coinlore", json.dumps(detail, ensure_ascii=False), fetched_at),
    )


def insert_history_points(conn: sqlite3.Connection, coin_key: str, rows: Iterable[dict[str, Any]], fetched_at: str) -> int:
    payload = []
    for row in rows:
        ts = to_int(row.get("time"))
        if ts is None:
            continue
        payload.append(
            (
                coin_key,
                ts * 1000,
                to_float(row.get("close")),
                None,
                to_float(row.get("volumeto")),
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
            ts = to_int(row.get("time"))
            if ts is None:
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
    ap = argparse.ArgumentParser(description="Collect free crypto data (CoinLore + CryptoCompare) into SQLite.")
    ap.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    ap.add_argument("--coins-limit", type=int, default=2000, help="0 = all ranked coins from CoinLore.")
    ap.add_argument("--exchange-limit", type=int, default=0, help="0 = all exchanges.")
    ap.add_argument("--history-from", default="2024-01-01T00:00:00+00:00")
    ap.add_argument("--history-to", default="now")
    ap.add_argument("--skip-coin-details", action="store_true")
    ap.add_argument("--skip-history", action="store_true")
    ap.add_argument("--skip-exchanges", action="store_true")
    ap.add_argument("--timeout-seconds", type=int, default=30)
    ap.add_argument("--min-interval-seconds", type=float, default=0.1)
    ap.add_argument("--max-retries", type=int, default=4)
    ap.add_argument("--retry-backoff-seconds", type=float, default=2.0)
    return ap


def main() -> int:
    args = build_parser().parse_args()
    args.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(args.db_path))
    conn.row_factory = sqlite3.Row
    init_db(conn)

    run_id = f"coinlore-{int(time.time())}"
    conn.execute(
        "INSERT INTO ingest_runs(run_id, started_at, status, args_json) VALUES (?, ?, ?, ?)",
        (run_id, utc_now_iso(), "running", json.dumps(vars(args), default=str, ensure_ascii=False)),
    )
    conn.commit()

    lore = JsonHttpClient(
        base_url=COINLORE_BASE,
        timeout_s=int(args.timeout_seconds),
        min_interval_s=float(args.min_interval_seconds),
        max_retries=int(args.max_retries),
        retry_backoff_s=float(args.retry_backoff_seconds),
    )
    cc = JsonHttpClient(
        base_url=CRYPTOCOMPARE_BASE,
        timeout_s=int(args.timeout_seconds),
        min_interval_s=max(0.1, float(args.min_interval_seconds)),
        max_retries=int(args.max_retries),
        retry_backoff_s=float(args.retry_backoff_seconds),
    )

    try:
        fetched_at = utc_now_iso()
        tickers = fetch_all_coinlore_tickers(lore, page_size=100)
        for row in tickers:
            upsert_coin(conn, row, fetched_at)
        conn.commit()
        print(f"[ok] coins={len(tickers)}", flush=True)

        inserted = insert_market_snapshot(conn, tickers, fetched_at)
        conn.commit()
        print(f"[ok] market_rows={inserted}", flush=True)

        ranked = sorted(tickers, key=lambda r: to_int(r.get("rank")) or 10**9)
        selected = ranked if int(args.coins_limit) == 0 else ranked[: max(0, int(args.coins_limit))]

        if not args.skip_coin_details:
            for idx, row in enumerate(selected, start=1):
                lore_id = str(row.get("id") or "")
                if not lore_id:
                    continue
                coin_key = f"coinlore:{lore_id}"
                try:
                    social: dict[str, Any] = {}
                    try:
                        social_raw = lore.get("/coin/social_stats/", {"id": lore_id})
                        if isinstance(social_raw, dict):
                            social = social_raw
                    except Exception as social_exc:
                        log_failure(conn, "coinlore:social_stats", coin_key, str(social_exc))
                    upsert_coin_detail(conn, lore_id, coin_key, row, social, utc_now_iso())
                    if idx % 50 == 0:
                        conn.commit()
                    print(f"[detail] {idx}/{len(selected)} coinlore:{lore_id}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] detail failed coinlore:{lore_id} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "coinlore:detail", coin_key, err)
            conn.commit()

        if not args.skip_history:
            start_ts = parse_utc_to_unix(args.history_from)
            end_ts = parse_utc_to_unix(args.history_to)
            hist_points = 0
            for idx, row in enumerate(selected, start=1):
                lore_id = str(row.get("id") or "")
                symbol = str(row.get("symbol") or "").upper()
                if not lore_id or not symbol:
                    continue
                coin_key = f"coinlore:{lore_id}"
                try:
                    hrows = fetch_cryptocompare_histoday(cc, symbol, start_ts, end_ts)
                    hist_points += insert_history_points(conn, coin_key, hrows, utc_now_iso())
                    if idx % 50 == 0:
                        conn.commit()
                    print(f"[history] {idx}/{len(selected)} {coin_key} points={len(hrows)}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] history failed {coin_key} symbol={symbol} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "cryptocompare:histoday", coin_key, err)
            conn.commit()
            print(f"[ok] history_points={hist_points}", flush=True)

        if not args.skip_exchanges:
            exchanges = lore.get("/exchanges/")
            if not isinstance(exchanges, dict):
                raise RuntimeError("CoinLore /exchanges response is not an object")
            ex_items = [(str(k), v) for k, v in exchanges.items() if isinstance(v, dict)]
            for ex_id, ex_row in ex_items:
                upsert_exchange(conn, ex_id, ex_row, utc_now_iso())
            conn.commit()
            print(f"[ok] exchanges={len(ex_items)}", flush=True)

            selected_ex = ex_items if int(args.exchange_limit) == 0 else ex_items[: max(0, int(args.exchange_limit))]
            for idx, (ex_id, _) in enumerate(selected_ex, start=1):
                try:
                    detail = lore.get("/exchange/", {"id": ex_id})
                    if not isinstance(detail, dict):
                        raise RuntimeError("exchange detail is not an object")
                    upsert_exchange_detail(conn, ex_id, detail, utc_now_iso())
                    if idx % 50 == 0:
                        conn.commit()
                    print(f"[exchange] {idx}/{len(selected_ex)} coinlore:{ex_id}", flush=True)
                except Exception as exc:
                    err = str(exc)
                    print(f"[warn] exchange detail failed coinlore:{ex_id} err={err}", file=sys.stderr, flush=True)
                    log_failure(conn, "coinlore:exchange_detail", f"coinlore:{ex_id}", err)
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
