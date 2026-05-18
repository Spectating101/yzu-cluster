#!/usr/bin/env python3
"""
Crypto Research Data Pipeline

Comprehensive multi-source collection pipeline for academic finance research.
Gathers all coin profiles, exchange metadata, and historical price series for
every coin listed on CoinGecko, minimising API costs by using free sources first
and CoinGecko Pro only for fields unavailable elsewhere.

── Data collected ────────────────────────────────────────────────────────────
  Coin profiles  : cg_id, symbol, name, web_slug, genesis_date, country_origin,
                   description, categories, homepage, whitepaper,
                   Twitter / Facebook / Telegram / Reddit / GitHub / Discord
  Categories     : full CoinGecko category list with market-cap data
  Exchanges      : id, name, year_established, country, trust_score,
                   trade_volume_24h_btc, website, social links, centralized flag
  Historical     : daily price_usd, market_cap_usd, volume_usd per coin

── Source strategy (cheapest first) ──────────────────────────────────────────
  Stage 1  CoinGecko public API (free, no key required)
             → Full coin list (~18 k coins) + categories list
  Stage 2  CoinPaprika API (free, no key required)
             → Coin descriptions, homepage, whitepaper, social links.
               Mapped to CoinGecko IDs via symbol matching.
  Stage 3  CryptoCompare API (free, no key required)
             → Historical daily OHLCV back to coin genesis (by ticker symbol)
  Stage 4  CoinGecko Pro API (paid key, optional but recommended)
             → web_slug, genesis_date, country_origin for every coin
               Exchange list + detailed exchange metadata
               History gap-fill for coins CryptoCompare does not cover

── Usage ─────────────────────────────────────────────────────────────────────
  # Free sources only (stages 1-3):
  python3 scripts/crypto_research_pipeline.py

  # Full collection with CoinGecko Pro key (recommended):
  python3 scripts/crypto_research_pipeline.py --coingecko-api-key CG-xxxxx

  # Quick run — top 500 coins, history from 2024:
  python3 scripts/crypto_research_pipeline.py --profile quick

  # Full run — all ~18k coins, history from 2020:
  python3 scripts/crypto_research_pipeline.py --profile full --coingecko-api-key CG-xxxxx

  # Resume an interrupted run (skips already-collected items):
  python3 scripts/crypto_research_pipeline.py --coingecko-api-key CG-xxxxx --resume

  # Run only a specific stage:
  python3 scripts/crypto_research_pipeline.py --only-stage 4 --coingecko-api-key CG-xxxxx

── Output ────────────────────────────────────────────────────────────────────
  data_lake/crypto_pipeline/research_db.sqlite3

  Tables:
    coin_profiles    — one row per coin, all metadata in dedicated columns
    coin_history     — daily time series (price, market_cap, volume)
    categories       — CoinGecko category definitions
    exchange_profiles — exchange metadata with social links
    failures         — per-item error log for auditing
    ingest_log       — run-level audit trail
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[1]
DEFAULT_DB = _REPO_ROOT / "data_lake" / "crypto_pipeline" / "research_db.sqlite3"

CG_PUBLIC_BASE = "https://api.coingecko.com/api/v3"
CG_PRO_BASE    = "https://pro-api.coingecko.com/api/v3"
CP_BASE        = "https://api.coinpaprika.com/v1"
CC_BASE        = "https://min-api.cryptocompare.com/data/v2"


# ── Utilities ──────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _first(value: Any) -> str:
    """Return first non-empty string from a value that may be str, list, or None."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        for v in value:
            r = _first(v)
            if r:
                return r
    return ""


def _f(v: Any) -> float | None:
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _i(v: Any) -> int | None:
    try:
        return int(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _ts_ms_to_date(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _parse_ts(value: str) -> int:
    if not value or value.lower() == "now":
        return int(time.time())
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


# ── HTTP Client ────────────────────────────────────────────────────────────────

@dataclass
class Client:
    base: str
    key: str = ""
    key_header: str = ""
    timeout: int = 30
    interval: float = 1.0
    retries: int = 4
    backoff: float = 3.0
    _last: float = field(default=0.0, repr=False, compare=False)

    def _wait(self) -> None:
        gap = self.interval - (time.monotonic() - self._last)
        if gap > 0:
            time.sleep(gap)

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        qs = urllib.parse.urlencode(
            {k: ("true" if v is True else "false" if v is False else str(v))
             for k, v in (params or {}).items() if v is not None}
        )
        url = f"{self.base}{path}"
        if qs:
            url = f"{url}?{qs}"

        for attempt in range(self.retries + 1):
            self._wait()
            req = urllib.request.Request(url)
            req.add_header("Accept", "application/json")
            req.add_header("User-Agent", "Mozilla/5.0 (research-pipeline/1.0)")
            if self.key and self.key_header:
                req.add_header(self.key_header, self.key)
            body = ""
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read().decode("utf-8", errors="replace")
                return json.loads(body)
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                if e.code in {408, 429, 500, 502, 503} and attempt < self.retries:
                    wait = self.backoff * (2 ** attempt)
                    print(
                        f"  [retry] HTTP {e.code} attempt={attempt+1}/{self.retries}"
                        f" wait={wait:.0f}s  {path}",
                        file=sys.stderr, flush=True,
                    )
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"HTTP {e.code} {url}: {err_body[:250]}") from e
            except urllib.error.URLError as e:
                if attempt < self.retries:
                    wait = self.backoff * (2 ** attempt)
                    print(
                        f"  [retry] network attempt={attempt+1}/{self.retries}"
                        f" wait={wait:.0f}s  {e}",
                        file=sys.stderr, flush=True,
                    )
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"Network error {url}: {e}") from e
            except json.JSONDecodeError as e:
                raise RuntimeError(f"Non-JSON from {url}: {body[:150]}") from e
            finally:
                self._last = time.monotonic()

        raise RuntimeError(f"Retries exhausted: {url}")


# ── Database schema ────────────────────────────────────────────────────────────

_SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS coin_profiles (
    cg_id               TEXT    PRIMARY KEY,
    symbol              TEXT,
    name                TEXT,
    web_slug            TEXT,
    genesis_date        TEXT,
    country_origin      TEXT,
    description_en      TEXT,
    categories_json     TEXT    DEFAULT '[]',
    homepage            TEXT,
    whitepaper          TEXT,
    twitter_handle      TEXT,
    facebook_username   TEXT,
    telegram_channel    TEXT,
    reddit_url          TEXT,
    github_url          TEXT,
    discord_url         TEXT,
    coingecko_rank      INTEGER,
    coingecko_score     REAL,
    community_score     REAL,
    developer_score     REAL,
    liquidity_score     REAL,
    cp_id               TEXT,
    metadata_source     TEXT,
    updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS coin_history (
    cg_id           TEXT    NOT NULL,
    date            TEXT    NOT NULL,
    price_usd       REAL,
    market_cap_usd  REAL,
    volume_usd      REAL,
    source          TEXT    NOT NULL,
    retrieved_at    TEXT    NOT NULL,
    PRIMARY KEY (cg_id, date)
);

CREATE TABLE IF NOT EXISTS categories (
    category_id             TEXT    PRIMARY KEY,
    name                    TEXT    NOT NULL,
    market_cap_usd          REAL,
    market_cap_change_24h   REAL,
    volume_24h_usd          REAL,
    retrieved_at            TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_profiles (
    exchange_id             TEXT    PRIMARY KEY,
    name                    TEXT,
    year_established        INTEGER,
    country                 TEXT,
    description             TEXT,
    url                     TEXT,
    image_url               TEXT,
    twitter_handle          TEXT,
    facebook_url            TEXT,
    reddit_url              TEXT,
    slack_url               TEXT,
    other_url_1             TEXT,
    other_url_2             TEXT,
    trust_score             INTEGER,
    trust_score_rank        INTEGER,
    trade_volume_24h_btc    REAL,
    centralized             INTEGER,
    has_trading_incentive   INTEGER,
    retrieved_at            TEXT
);

CREATE TABLE IF NOT EXISTS failures (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stage       TEXT    NOT NULL,
    item_id     TEXT,
    error       TEXT    NOT NULL,
    occurred_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_log (
    run_id          TEXT    PRIMARY KEY,
    started_at      TEXT    NOT NULL,
    completed_at    TEXT,
    status          TEXT    NOT NULL,
    profile         TEXT,
    cg_key_present  INTEGER,
    note            TEXT
);
"""


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()


def _fail(conn: sqlite3.Connection, stage: str, item_id: str | None, err: str) -> None:
    conn.execute(
        "INSERT INTO failures(stage, item_id, error, occurred_at) VALUES (?,?,?,?)",
        (stage, item_id, err[:2000], _now()),
    )
    conn.commit()


def _has_metadata(conn: sqlite3.Connection, cg_id: str) -> bool:
    """True if this coin already has enriched metadata (beyond the bare list entry)."""
    row = conn.execute(
        "SELECT metadata_source FROM coin_profiles WHERE cg_id=?", (cg_id,)
    ).fetchone()
    if row is None:
        return False
    src = row[0] or ""
    return src not in ("", "cg_list")


def _has_history(conn: sqlite3.Connection, cg_id: str) -> bool:
    row = conn.execute(
        "SELECT COUNT(*) FROM coin_history WHERE cg_id=?", (cg_id,)
    ).fetchone()
    return bool(row and row[0] > 0)


# ── Stage 1: CoinGecko bootstrap (free public) ────────────────────────────────

def stage1_bootstrap(conn: sqlite3.Connection, cg: Client) -> list[dict]:
    """
    Fetch the full CoinGecko coin list and categories using the public API.
    No API key required. Returns the raw coin list.
    """
    print("[stage 1] CoinGecko bootstrap — coin list + categories (free)", flush=True)

    # Categories with live market-cap data
    try:
        cats = cg.get("/coins/categories")
        if isinstance(cats, list):
            for c in cats:
                cid = str(c.get("id") or "")
                if not cid:
                    continue
                conn.execute(
                    """INSERT INTO categories(
                           category_id, name, market_cap_usd,
                           market_cap_change_24h, volume_24h_usd, retrieved_at)
                       VALUES (?,?,?,?,?,?)
                       ON CONFLICT(category_id) DO UPDATE SET
                           name=excluded.name,
                           market_cap_usd=excluded.market_cap_usd,
                           market_cap_change_24h=excluded.market_cap_change_24h,
                           volume_24h_usd=excluded.volume_24h_usd,
                           retrieved_at=excluded.retrieved_at""",
                    (cid, str(c.get("name") or ""),
                     _f(c.get("market_cap")), _f(c.get("market_cap_change_24h")),
                     _f(c.get("volume_24h")), _now()),
                )
            conn.commit()
            print(f"  categories={len(cats)}", flush=True)
    except Exception as e:
        _fail(conn, "cg_categories", None, str(e))
        print(f"  [warn] categories failed: {e}", file=sys.stderr, flush=True)

    # Full coin list (id, symbol, name — no detail yet)
    coins: list[dict] = []
    try:
        coins = cg.get("/coins/list", {"include_platform": False, "status": "active"})
        if not isinstance(coins, list):
            raise RuntimeError("Expected list from /coins/list")
        for c in coins:
            cg_id = str(c.get("id") or "")
            if not cg_id:
                continue
            conn.execute(
                """INSERT INTO coin_profiles(cg_id, symbol, name, metadata_source, updated_at)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(cg_id) DO NOTHING""",
                (cg_id,
                 str(c.get("symbol") or "").upper(),
                 str(c.get("name") or ""),
                 "cg_list", _now()),
            )
        conn.commit()
        print(f"  coins={len(coins)}", flush=True)
    except Exception as e:
        _fail(conn, "cg_coin_list", None, str(e))
        print(f"  [warn] coin list failed: {e}", file=sys.stderr, flush=True)

    # Market snapshot — best-effort, only 1 retry so 429s don't stall the run.
    # Rank data is nice-to-have for ordering; stage 4a will overwrite with authoritative values.
    rank_client = Client(
        base=cg.base, key=cg.key, key_header=cg.key_header,
        interval=cg.interval, retries=1, backoff=3.0,
    )
    page = 1
    rank_rows = 0
    while True:
        try:
            chunk = rank_client.get("/coins/markets", {
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": 250,
                "page": page,
                "sparkline": False,
            })
        except Exception as e:
            _fail(conn, "cg_markets", f"page={page}", str(e))
            print(
                f"  [warn] market snapshot page {page} skipped (rate-limited on public API): {e}",
                file=sys.stderr, flush=True,
            )
            break

        if not isinstance(chunk, list) or not chunk:
            break

        for m in chunk:
            cg_id = str(m.get("id") or "")
            if not cg_id:
                continue
            conn.execute(
                "UPDATE coin_profiles SET coingecko_rank=? WHERE cg_id=?",
                (_i(m.get("market_cap_rank")), cg_id),
            )
            rank_rows += 1

        conn.commit()

        if len(chunk) < 250:
            break
        page += 1

    print(f"  market snapshot rows={rank_rows}", flush=True)

    return coins


# ── Stage 2: CoinPaprika metadata (free) ──────────────────────────────────────

def _build_symbol_map(conn: sqlite3.Connection) -> dict[str, str]:
    """
    Build a {SYMBOL: cg_id} map for symbols that appear exactly once in the
    coin_profiles table.  Duplicate symbols are excluded to avoid mis-mapping.
    """
    rows = conn.execute(
        "SELECT cg_id, symbol FROM coin_profiles ORDER BY coingecko_rank NULLS LAST"
    ).fetchall()
    seen: dict[str, str] = {}
    dups: set[str] = set()
    for cg_id, sym in rows:
        sym = (sym or "").upper().strip()
        if not sym:
            continue
        if sym in seen:
            dups.add(sym)
        else:
            seen[sym] = cg_id
    for s in dups:
        del seen[s]
    return seen


def stage2_coinpaprika(
    conn: sqlite3.Connection, cp: Client, limit: int, resume: bool
) -> None:
    """
    Collect coin metadata from CoinPaprika (free) and map records to CoinGecko
    IDs via symbol matching.  Fills: description, homepage, whitepaper, Twitter,
    Facebook, Telegram, Reddit, GitHub, Discord.
    """
    print("[stage 2] CoinPaprika — free metadata", flush=True)

    sym_map = _build_symbol_map(conn)

    try:
        cp_coins = cp.get("/coins")
        if not isinstance(cp_coins, list):
            raise RuntimeError("Expected list")
    except Exception as e:
        _fail(conn, "cp_coin_list", None, str(e))
        print(f"  [warn] CoinPaprika coin list failed: {e}", file=sys.stderr, flush=True)
        return

    # Sort by rank, take active coins only, apply limit
    ranked = sorted(
        [c for c in cp_coins if isinstance(c, dict) and c.get("is_active")],
        key=lambda r: _i(r.get("rank")) or 999_999,
    )
    if limit > 0:
        ranked = ranked[:limit]

    print(f"  processing {len(ranked)} coins via CoinPaprika", flush=True)
    done = 0
    for idx, cp_coin in enumerate(ranked, 1):
        sym   = str(cp_coin.get("symbol") or "").upper()
        cg_id = sym_map.get(sym)
        if not cg_id:
            continue  # Cannot map to CoinGecko universe

        if resume and _has_metadata(conn, cg_id):
            continue

        cp_id = str(cp_coin.get("id") or "")
        try:
            detail = cp.get(f"/coins/{urllib.parse.quote(cp_id, safe='')}")
            if not isinstance(detail, dict):
                raise RuntimeError("non-dict response")

            links = detail.get("links") or {}

            homepage    = _first(links.get("website"))
            wp_raw      = detail.get("whitepaper") or {}
            whitepaper  = _first(wp_raw.get("link") if isinstance(wp_raw, dict) else wp_raw)
            reddit      = _first(links.get("reddit"))
            facebook    = _first(links.get("facebook"))
            github      = _first(links.get("source_code"))
            description = str(detail.get("description") or "")

            # links_extended carries {url, type} dicts with finer-grained types
            telegram = twitter = discord = ""
            for ext in (detail.get("links_extended") or []):
                if not isinstance(ext, dict):
                    continue
                t = str(ext.get("type") or "").lower()
                u = str(ext.get("url") or "").strip()
                if not u:
                    continue
                if "telegram" in t and not telegram:
                    telegram = u
                elif "twitter" in t and not twitter:
                    twitter = u
                elif "discord" in t and not discord:
                    discord = u

            conn.execute(
                """UPDATE coin_profiles SET
                     cp_id=?,
                     description_en=COALESCE(NULLIF(description_en,''), ?),
                     homepage=COALESCE(NULLIF(homepage,''), ?),
                     whitepaper=COALESCE(NULLIF(whitepaper,''), ?),
                     twitter_handle=COALESCE(NULLIF(twitter_handle,''), ?),
                     facebook_username=COALESCE(NULLIF(facebook_username,''), ?),
                     telegram_channel=COALESCE(NULLIF(telegram_channel,''), ?),
                     reddit_url=COALESCE(NULLIF(reddit_url,''), ?),
                     github_url=COALESCE(NULLIF(github_url,''), ?),
                     discord_url=COALESCE(NULLIF(discord_url,''), ?),
                     metadata_source='coinpaprika',
                     updated_at=?
                   WHERE cg_id=?""",
                (cp_id,
                 description or None, homepage or None, whitepaper or None,
                 twitter or None, facebook or None, telegram or None,
                 reddit or None, github or None, discord or None,
                 _now(), cg_id),
            )
            done += 1
            if idx % 100 == 0:
                conn.commit()
                print(f"  {idx}/{len(ranked)} processed  enriched={done}", flush=True)
        except Exception as e:
            _fail(conn, "cp_detail", cp_id, str(e))

    conn.commit()
    print(f"  done  enriched={done}", flush=True)


# ── Stage 3: CryptoCompare historical prices (free) ───────────────────────────

def _cc_histoday(
    cc: Client, symbol: str, from_ts: int, to_ts: int
) -> list[tuple[str, float | None, float | None]]:
    """
    Fetch all available daily closes from CryptoCompare for `symbol` vs USD.
    Returns list of (date_str, close_price, volume_to).
    """
    all_rows: dict[int, dict] = {}
    cur_to   = to_ts
    start_day = from_ts - (from_ts % 86400)

    while True:
        days  = max(1, math.ceil((cur_to - from_ts) / 86400) + 2)
        limit = min(2000, days)
        resp  = cc.get("/histoday", {
            "fsym": symbol, "tsym": "USD",
            "limit": limit, "toTs": max(cur_to, from_ts),
        })
        if not isinstance(resp, dict) or resp.get("Response") != "Success":
            break
        rows = ((resp.get("Data") or {}).get("Data")) or []
        if not isinstance(rows, list) or not rows:
            break

        oldest = None
        for row in rows:
            if not isinstance(row, dict):
                continue
            ts = _i(row.get("time"))
            if ts is None or ts < start_day or ts > to_ts:
                continue
            all_rows[ts] = row
            oldest = ts if oldest is None else min(oldest, ts)

        if oldest is None or oldest <= start_day:
            break
        nxt = oldest - 86400
        if nxt >= cur_to:
            break
        cur_to = nxt

    out = []
    for ts in sorted(all_rows):
        row = all_rows[ts]
        date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        out.append((date, _f(row.get("close")), _f(row.get("volumeto"))))
    return out


def stage3_cryptocompare(
    conn: sqlite3.Connection,
    cc: Client,
    limit: int,
    from_ts: int,
    to_ts: int,
    resume: bool,
) -> None:
    """
    Fetch daily price history from CryptoCompare (free) for all coins in the
    profile table.  Market-cap is not available from this source; price and
    volume are stored, and market_cap_usd is left NULL for CoinGecko to fill.
    """
    print("[stage 3] CryptoCompare — historical prices (free)", flush=True)

    rows = conn.execute(
        "SELECT cg_id, symbol FROM coin_profiles ORDER BY coingecko_rank NULLS LAST"
    ).fetchall()
    if limit > 0:
        rows = rows[:limit]

    inserted_total = 0
    for idx, (cg_id, sym) in enumerate(rows, 1):
        if not sym:
            continue
        if resume and _has_history(conn, cg_id):
            continue
        try:
            pts = _cc_histoday(cc, sym, from_ts, to_ts)
            if pts:
                conn.executemany(
                    """INSERT INTO coin_history(
                           cg_id, date, price_usd, market_cap_usd,
                           volume_usd, source, retrieved_at)
                       VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT(cg_id, date) DO UPDATE SET
                           price_usd=excluded.price_usd,
                           volume_usd=excluded.volume_usd,
                           retrieved_at=excluded.retrieved_at""",
                    [(cg_id, date, price, None, vol, "cryptocompare", _now())
                     for date, price, vol in pts],
                )
                inserted_total += len(pts)
            if idx % 200 == 0:
                conn.commit()
                print(f"  {idx}/{len(rows)} coins  history_rows={inserted_total}", flush=True)
        except Exception as e:
            _fail(conn, "cc_histoday", cg_id, str(e))

    conn.commit()
    print(f"  done  history_rows={inserted_total}", flush=True)


# ── Stage 4a: CoinGecko Pro — coin detail gap-fill ────────────────────────────

def stage4a_cg_metadata(
    conn: sqlite3.Connection, cg: Client, limit: int, resume: bool
) -> None:
    """
    Fetch full coin detail from CoinGecko Pro for every coin.

    Always overwrites CoinGecko-specific fields (web_slug, genesis_date,
    country_origin, categories, scores) since these are authoritative.
    Uses COALESCE for fields already populated by CoinPaprika.
    """
    print("[stage 4a] CoinGecko Pro — coin detail gap-fill", flush=True)

    rows = conn.execute(
        "SELECT cg_id FROM coin_profiles ORDER BY coingecko_rank NULLS LAST"
    ).fetchall()
    if limit > 0:
        rows = rows[:limit]

    done = 0
    for idx, (cg_id,) in enumerate(rows, 1):
        if resume:
            r = conn.execute(
                "SELECT web_slug FROM coin_profiles WHERE cg_id=?", (cg_id,)
            ).fetchone()
            if r and r[0]:  # web_slug populated → already did Pro detail
                continue

        try:
            d = cg.get(
                f"/coins/{urllib.parse.quote(cg_id, safe='')}",
                {
                    "localization": False, "tickers": False,
                    "market_data": True, "community_data": True,
                    "developer_data": True, "sparkline": False,
                },
            )
            if not isinstance(d, dict):
                raise RuntimeError("non-dict response")

            links    = d.get("links") or {}
            cats     = [str(c) for c in (d.get("categories") or []) if c]
            desc_en  = (d.get("description") or {}).get("en") or ""
            web_slug = d.get("web_slug") or d.get("id") or cg_id

            conn.execute(
                """UPDATE coin_profiles SET
                     web_slug=?,
                     genesis_date=?,
                     country_origin=?,
                     description_en=COALESCE(NULLIF(description_en,''), ?),
                     categories_json=?,
                     homepage=COALESCE(NULLIF(homepage,''), ?),
                     whitepaper=COALESCE(NULLIF(whitepaper,''), ?),
                     twitter_handle=COALESCE(NULLIF(twitter_handle,''), ?),
                     facebook_username=COALESCE(NULLIF(facebook_username,''), ?),
                     telegram_channel=COALESCE(NULLIF(telegram_channel,''), ?),
                     reddit_url=COALESCE(NULLIF(reddit_url,''), ?),
                     github_url=COALESCE(NULLIF(github_url,''), ?),
                     coingecko_rank=?,
                     coingecko_score=?,
                     community_score=?,
                     developer_score=?,
                     liquidity_score=?,
                     metadata_source='coingecko_pro',
                     updated_at=?
                   WHERE cg_id=?""",
                (
                    web_slug,
                    d.get("genesis_date"),
                    d.get("country_origin"),
                    desc_en or None,
                    json.dumps(cats, ensure_ascii=False),
                    _first(links.get("homepage")),
                    _first(links.get("whitepaper")),
                    links.get("twitter_screen_name"),
                    links.get("facebook_username"),
                    links.get("telegram_channel_identifier"),
                    links.get("subreddit_url"),
                    _first((links.get("repos_url") or {}).get("github") or []),
                    _i(d.get("market_cap_rank")),
                    _f(d.get("coingecko_score")),
                    _f(d.get("community_score")),
                    _f(d.get("developer_score")),
                    _f(d.get("liquidity_score")),
                    _now(),
                    cg_id,
                ),
            )
            done += 1
            if idx % 25 == 0:
                conn.commit()
                print(f"  {idx}/{len(rows)} enriched", flush=True)
        except Exception as e:
            _fail(conn, "cg_pro_detail", cg_id, str(e))
            print(f"  [warn] cg detail {cg_id}: {e}", file=sys.stderr, flush=True)

    conn.commit()
    print(f"  done  updated={done}", flush=True)


# ── Stage 4b: CoinGecko Pro — history gap-fill ────────────────────────────────

def stage4b_cg_history(
    conn: sqlite3.Connection,
    cg: Client,
    limit: int,
    from_ts: int,
    to_ts: int,
    resume: bool,
) -> None:
    """
    Fetch daily price/market-cap/volume history from CoinGecko Pro for coins
    that have no history rows yet (missed by CryptoCompare).
    Also back-fills market_cap_usd for coins where CryptoCompare only provided price.
    """
    print("[stage 4b] CoinGecko Pro — history gap-fill", flush=True)

    rows = conn.execute(
        """SELECT p.cg_id FROM coin_profiles p
           WHERE NOT EXISTS (SELECT 1 FROM coin_history h WHERE h.cg_id = p.cg_id)
           ORDER BY p.coingecko_rank NULLS LAST"""
    ).fetchall()
    if limit > 0:
        rows = rows[:limit]

    print(f"  {len(rows)} coins with no history yet", flush=True)
    inserted_total = 0
    for idx, (cg_id,) in enumerate(rows, 1):
        try:
            resp = cg.get(
                f"/coins/{urllib.parse.quote(cg_id, safe='')}/market_chart/range",
                {"vs_currency": "usd", "from": from_ts, "to": to_ts},
            )
            if not isinstance(resp, dict):
                raise RuntimeError("non-dict response")

            prices = resp.get("prices") or []
            caps   = {int(x[0]): x[1] for x in (resp.get("market_caps") or []) if len(x) >= 2}
            vols   = {int(x[0]): x[1] for x in (resp.get("total_volumes") or []) if len(x) >= 2}

            pts = []
            for item in prices:
                if len(item) < 2:
                    continue
                ts_ms = int(item[0])
                pts.append((
                    cg_id, _ts_ms_to_date(ts_ms), _f(item[1]),
                    _f(caps.get(ts_ms)), _f(vols.get(ts_ms)),
                    "coingecko_pro", _now(),
                ))

            if pts:
                conn.executemany(
                    """INSERT INTO coin_history(
                           cg_id, date, price_usd, market_cap_usd,
                           volume_usd, source, retrieved_at)
                       VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT(cg_id, date) DO UPDATE SET
                           price_usd=excluded.price_usd,
                           market_cap_usd=excluded.market_cap_usd,
                           volume_usd=excluded.volume_usd,
                           retrieved_at=excluded.retrieved_at""",
                    pts,
                )
                inserted_total += len(pts)

            if idx % 20 == 0:
                conn.commit()
                print(f"  {idx}/{len(rows)} coins  history_rows={inserted_total}", flush=True)
        except Exception as e:
            _fail(conn, "cg_pro_history", cg_id, str(e))

    conn.commit()
    print(f"  done  history_rows={inserted_total}", flush=True)


# ── Stage 4c: CoinGecko Pro — exchange data ───────────────────────────────────

def stage4c_exchanges(
    conn: sqlite3.Connection, cg: Client, ex_limit: int
) -> None:
    """
    Collect full exchange list and per-exchange detail from CoinGecko Pro.
    Fills: name, year_established, country, trust_score, trade_volume_24h_btc,
    website, Twitter, Facebook, Reddit, Slack, centralized flag.
    """
    print("[stage 4c] CoinGecko Pro — exchange data", flush=True)

    # Paginated exchange list
    all_exchanges: list[dict] = []
    page = 1
    while True:
        chunk = cg.get("/exchanges", {"page": page, "per_page": 250})
        if not isinstance(chunk, list) or not chunk:
            break
        all_exchanges.extend(chunk)
        print(f"  exchanges page={page} rows={len(chunk)} total={len(all_exchanges)}", flush=True)
        if len(chunk) < 250:
            break
        page += 1

    # Insert summary rows
    for ex in all_exchanges:
        eid = str(ex.get("id") or "")
        if not eid:
            continue
        conn.execute(
            """INSERT INTO exchange_profiles(
                   exchange_id, name, year_established, country, description,
                   url, image_url, trust_score, trust_score_rank,
                   trade_volume_24h_btc, has_trading_incentive, retrieved_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(exchange_id) DO UPDATE SET
                   name=excluded.name,
                   year_established=excluded.year_established,
                   country=excluded.country,
                   description=excluded.description,
                   url=excluded.url,
                   image_url=excluded.image_url,
                   trust_score=excluded.trust_score,
                   trust_score_rank=excluded.trust_score_rank,
                   trade_volume_24h_btc=excluded.trade_volume_24h_btc,
                   has_trading_incentive=excluded.has_trading_incentive,
                   retrieved_at=excluded.retrieved_at""",
            (eid, str(ex.get("name") or ""),
             _i(ex.get("year_established")), str(ex.get("country") or ""),
             str(ex.get("description") or ""), str(ex.get("url") or ""),
             str(ex.get("image") or ""),
             _i(ex.get("trust_score")), _i(ex.get("trust_score_rank")),
             _f(ex.get("trade_volume_24h_btc")),
             1 if ex.get("has_trading_incentive") else 0, _now()),
        )
    conn.commit()
    print(f"  inserted {len(all_exchanges)} exchange summaries", flush=True)

    # Per-exchange detail (social links, centralized flag)
    eids = [str(e.get("id")) for e in all_exchanges if e.get("id")]
    if ex_limit > 0:
        eids = eids[:ex_limit]

    print(f"  fetching detail for {len(eids)} exchanges", flush=True)
    for idx, eid in enumerate(eids, 1):
        try:
            d = cg.get(f"/exchanges/{urllib.parse.quote(eid, safe='')}")
            if not isinstance(d, dict):
                raise RuntimeError("non-dict response")
            conn.execute(
                """UPDATE exchange_profiles SET
                     twitter_handle=?,
                     facebook_url=?,
                     reddit_url=?,
                     slack_url=?,
                     other_url_1=?,
                     other_url_2=?,
                     centralized=?,
                     retrieved_at=?
                   WHERE exchange_id=?""",
                (d.get("twitter_handle"), d.get("facebook_url"), d.get("reddit_url"),
                 d.get("slack_url"), d.get("other_url_1"), d.get("other_url_2"),
                 1 if d.get("centralized") else 0, _now(), eid),
            )
            if idx % 20 == 0:
                conn.commit()
                print(f"  {idx}/{len(eids)} exchange details fetched", flush=True)
        except Exception as e:
            _fail(conn, "cg_exchange_detail", eid, str(e))
            print(f"  [warn] exchange detail {eid}: {e}", file=sys.stderr, flush=True)

    conn.commit()
    print(f"  done  exchanges_detailed={len(eids)}", flush=True)


# ── CLI ────────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Crypto research data pipeline (multi-source, cost-optimised).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--db-path", type=Path, default=DEFAULT_DB,
                    help=f"Output SQLite database. Default: {DEFAULT_DB}")
    ap.add_argument("--coingecko-api-key", default=os.getenv("COINGECKO_API_KEY", ""),
                    help="CoinGecko Pro key (or COINGECKO_API_KEY env). Unlocks stages 4a/4b/4c.")
    ap.add_argument("--profile", choices=["quick", "full"], default="quick",
                    help="quick=top 500 coins, 2024-present history;  full=all coins, 2020-present")
    ap.add_argument("--coins-limit", type=int, default=None,
                    help="Override coins limit (0=all; overrides --profile).")
    ap.add_argument("--history-from", default="",
                    help="ISO-8601 start date for history (overrides --profile default).")
    ap.add_argument("--history-to", default="now",
                    help="ISO-8601 end date for history. Default: now.")
    ap.add_argument("--exchange-limit", type=int, default=0,
                    help="Max exchanges to fetch full detail for (0=all). Pro only.")
    ap.add_argument("--resume", action="store_true",
                    help="Skip coins/exchanges already present in the database.")
    ap.add_argument("--skip-free-metadata", action="store_true",
                    help="Skip stage 2 (CoinPaprika metadata).")
    ap.add_argument("--skip-history", action="store_true",
                    help="Skip stages 3 and 4b (all history collection).")
    ap.add_argument("--skip-exchanges", action="store_true",
                    help="Skip stage 4c (exchange collection).")
    ap.add_argument("--only-stage", type=int, choices=[1, 2, 3, 4], default=None,
                    help="Run only the specified stage number and exit.")
    ap.add_argument("--cg-interval", type=float, default=2.5,
                    help="Seconds between CoinGecko requests (default 2.5s).")
    ap.add_argument("--cp-interval", type=float, default=0.25,
                    help="Seconds between CoinPaprika requests (default 0.25s).")
    ap.add_argument("--cc-interval", type=float, default=0.15,
                    help="Seconds between CryptoCompare requests (default 0.15s).")
    ap.add_argument("--max-retries", type=int, default=4,
                    help="Max retries per request across all sources.")
    return ap


def main() -> int:
    args  = _build_parser().parse_args()
    cg_key = (args.coingecko_api_key or "").strip()

    # Resolve profile defaults
    profile     = args.profile
    coins_limit = (
        args.coins_limit if args.coins_limit is not None
        else (500 if profile == "quick" else 0)
    )
    hist_from = args.history_from.strip() or (
        "2024-01-01T00:00:00+00:00" if profile == "quick"
        else "2020-01-01T00:00:00+00:00"
    )
    from_ts = _parse_ts(hist_from)
    to_ts   = _parse_ts(args.history_to)

    args.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(args.db_path))
    conn.row_factory = sqlite3.Row
    _init_db(conn)

    run_id = f"research-{int(time.time())}"
    conn.execute(
        "INSERT INTO ingest_log(run_id, started_at, status, profile, cg_key_present)"
        " VALUES (?,?,?,?,?)",
        (run_id, _now(), "running", profile, 1 if cg_key else 0),
    )
    conn.commit()

    print(
        f"[pipeline] run_id={run_id}  profile={profile}"
        f"  coins_limit={coins_limit}  cg_key={'yes' if cg_key else 'no (free only)'}",
        flush=True,
    )
    print(f"[pipeline] history {hist_from} → {args.history_to}", flush=True)
    print(f"[pipeline] db={args.db_path}", flush=True)

    # Build per-source HTTP clients
    cg_base = CG_PRO_BASE if cg_key else CG_PUBLIC_BASE
    cg = Client(
        base=cg_base.rstrip("/"),
        key=cg_key,
        key_header="x-cg-pro-api-key" if cg_key else "",
        interval=args.cg_interval if cg_key else 2.0,
        retries=args.max_retries, backoff=5.0,
    )
    cp = Client(base=CP_BASE,  interval=args.cp_interval, retries=args.max_retries, backoff=2.0)
    cc = Client(base=CC_BASE,  interval=args.cc_interval, retries=args.max_retries, backoff=2.0)

    only = args.only_stage

    try:
        # ── Stage 1: CoinGecko coin list + categories (always free) ──
        if only in (None, 1):
            stage1_bootstrap(conn, cg)

        # ── Stage 2: CoinPaprika metadata (free) ──
        if only in (None, 2) and not args.skip_free_metadata:
            stage2_coinpaprika(conn, cp, coins_limit, args.resume)

        # ── Stage 3: CryptoCompare history (free) ──
        if only in (None, 3) and not args.skip_history:
            stage3_cryptocompare(conn, cc, coins_limit, from_ts, to_ts, args.resume)

        # ── Stage 4: CoinGecko Pro gap-fill (requires key) ──
        if cg_key and only in (None, 4):
            stage4a_cg_metadata(conn, cg, coins_limit, args.resume)
            if not args.skip_history:
                stage4b_cg_history(conn, cg, coins_limit, from_ts, to_ts, args.resume)
            if not args.skip_exchanges:
                stage4c_exchanges(conn, cg, args.exchange_limit)
        elif not cg_key and only == 4:
            print("[skip] stage 4 requires --coingecko-api-key", flush=True)

        conn.execute(
            "UPDATE ingest_log SET completed_at=?, status=?, note=? WHERE run_id=?",
            (_now(), "done", "success", run_id),
        )
        conn.commit()
        print(f"\n✅  Completed  run_id={run_id}  db={args.db_path}", flush=True)
        return 0

    except Exception as exc:
        conn.execute(
            "UPDATE ingest_log SET completed_at=?, status=?, note=? WHERE run_id=?",
            (_now(), "failed", str(exc)[:1000], run_id),
        )
        conn.commit()
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
