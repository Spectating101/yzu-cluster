#!/usr/bin/env python3
"""Collect prediction-market catalogues, probability histories, and asset panels.

This script implements the pipeline sketched in handoff.md/handoff2.md while
keeping the first data pass reproducible and restartable.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
import requests

try:
    from tqdm import tqdm
except Exception:  # pragma: no cover - tqdm is optional at runtime
    tqdm = None

warnings.filterwarnings("ignore", message="urllib3 .* doesn't match a supported version")


POLY_GAMMA_BASE = "https://gamma-api.polymarket.com"
POLY_CLOB_BASE = "https://clob.polymarket.com"
KALSHI_BASE = "https://external-api.kalshi.com/trade-api/v2"

DEFAULT_START_DATE = "2021-01-01"
DEFAULT_USER_AGENT = "Sharpe-Renaissance prediction-market research collector/0.1"


KEYWORDS: dict[str, list[str]] = {
    "MACRO_FED": [
        "fed",
        "fomc",
        "federal reserve",
        "rate cut",
        "rate hike",
        "basis points",
        "interest rate",
        "jerome powell",
        "terminal rate",
    ],
    "MACRO_CPI": [
        "cpi",
        "inflation",
        "pce",
        "consumer price",
        "core inflation",
        "prices",
    ],
    "MACRO_GDP": [
        "gdp",
        "recession",
        "unemployment",
        "jobs report",
        "nonfarm",
        "payroll",
        "jobless",
    ],
    "POL_US": [
        "election",
        "president",
        "congress",
        "senate",
        "house",
        "legislation",
        "bill",
        "act",
        "trump",
        "biden",
        "kamala",
        "kamala harris",
        "desantis",
        "rfk",
    ],
    "POL_GEO": [
        "war",
        "ukraine",
        "russia",
        "china",
        "taiwan",
        "iran",
        "israel",
        "gaza",
        "sanctions",
        "nato",
        "ceasefire",
        "conflict",
        "missile",
    ],
    "REG_CRYPTO": [
        "sec",
        "etf",
        "bitcoin etf",
        "ethereum etf",
        "crypto regulation",
        "clarity act",
        "fit21",
        "cftc",
        "ripple",
        "coinbase",
        "binance",
        "stablecoin",
    ],
    "REG_SECTOR": [
        "antitrust",
        "fda",
        "drug approval",
        "ai regulation",
        "google",
        "meta",
        "amazon",
        "doj",
        "ftc",
        "nvidia",
        "tesla",
    ],
    "CORP": [
        "earnings",
        "acquisition",
        "merger",
        "ceo",
        "bankruptcy",
        "buyout",
        "ipo",
        "quarterly",
        "guidance",
    ],
    "TRADE": [
        "tariff",
        "trade war",
        "trade deal",
        "import",
        "export",
        "customs",
        "wto",
    ],
    "CRYPTO_PRICE": [
        "bitcoin above",
        "btc above",
        "eth above",
        "ethereum above",
        "solana above",
        "xrp above",
        "ripple price",
        "bitcoin price",
        "btc price",
        "ethereum price",
        "eth price",
        "solana price",
        "xrp price",
        "will bitcoin",
        "will ethereum",
        "will btc",
        "will eth",
    ],
}


CATEGORY_ASSET_MAP: dict[str, dict[str, Any]] = {
    "MACRO_FED": {
        "assets": ["^TNX", "^IRX", "TLT", "^GSPC", "GLD"],
        "primary": "^TNX",
        "rationale": "Fed decisions directly price into yields.",
    },
    "MACRO_CPI": {
        "assets": ["GLD", "TIP", "^GSPC", "DX-Y.NYB"],
        "primary": "GLD",
        "rationale": "Inflation surprises drive gold and TIPS.",
    },
    "MACRO_GDP": {
        "assets": ["^GSPC", "XLY", "XLP", "HYG"],
        "primary": "^GSPC",
        "rationale": "Growth shocks affect broad equity.",
    },
    "POL_US": {
        "assets": ["^GSPC", "XLE", "XLV", "XLF", "DJT"],
        "primary": "^GSPC",
        "rationale": "Policy uncertainty prices into broad market.",
    },
    "POL_GEO": {
        "assets": ["CL=F", "GLD", "ITA", "^VIX"],
        "primary": "CL=F",
        "rationale": "Geopolitical risk drives energy and safe havens.",
    },
    "REG_CRYPTO": {
        "assets": ["BTC-USD", "ETH-USD", "SOL-USD"],
        "primary": "BTC-USD",
        "rationale": "Crypto regulation prices into BTC first.",
    },
    "REG_SECTOR": {
        "assets": ["XLK", "XLV", "META", "GOOGL", "AMZN"],
        "primary": "XLK",
        "rationale": "Sector-specific regulation affects relevant ETFs.",
    },
    "CORP": {
        "assets": [],
        "primary": None,
        "rationale": "Specific ticker match required.",
    },
    "TRADE": {
        "assets": ["XLI", "XLY", "DX-Y.NYB", "^GSPC"],
        "primary": "XLI",
        "rationale": "Tariffs hit import-intensive sectors.",
    },
    "CRYPTO_PRICE": {
        "assets": ["BTC-USD", "ETH-USD"],
        "primary": "BTC-USD",
        "rationale": "Direct crypto price contracts.",
    },
    "OTHER": {
        "assets": [],
        "primary": None,
        "rationale": "No pre-specified research match.",
    },
}


COMMON_COMPANY_TICKERS = {
    "apple": "AAPL",
    "microsoft": "MSFT",
    "nvidia": "NVDA",
    "tesla": "TSLA",
    "amazon": "AMZN",
    "google": "GOOGL",
    "alphabet": "GOOGL",
    "meta": "META",
    "facebook": "META",
    "netflix": "NFLX",
    "coinbase": "COIN",
    "microstrategy": "MSTR",
    "strategy": "MSTR",
    "ripple": "XRP-USD",
    "blackrock": "BLK",
    "jpmorgan": "JPM",
    "goldman": "GS",
    "boeing": "BA",
    "ford": "F",
    "gm": "GM",
}


@dataclass
class CollectorContext:
    out_dir: Path
    session: requests.Session
    timeout: int
    rate_sleep: float
    polymarket_verify_tls: bool
    errors: list[dict[str, Any]]


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


def parse_dt(value: Any) -> datetime | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        try:
            return datetime.fromtimestamp(int(text), tz=UTC)
        except Exception:
            return None
    text = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def to_unix(value: Any, default: datetime | None = None) -> int:
    dt = parse_dt(value)
    if dt is None:
        dt = default or datetime.fromisoformat(DEFAULT_START_DATE).replace(tzinfo=UTC)
    return int(dt.timestamp())


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float, np.integer, np.floating)):
        if pd.isna(value):
            return None
        return float(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def nested_float(obj: dict[str, Any] | None, *keys: str) -> float | None:
    if not isinstance(obj, dict):
        return None
    for key in keys:
        val = as_float(obj.get(key))
        if val is not None:
            return val
    return None


def request_json(
    ctx: CollectorContext,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    method: str = "GET",
    json_body: Any | None = None,
    verify: bool = True,
    tries: int = 3,
    record_error: bool = True,
) -> Any | None:
    last_exc: str | None = None
    for attempt in range(tries):
        try:
            if method == "POST":
                resp = ctx.session.post(
                    url,
                    params=params,
                    json=json_body,
                    timeout=ctx.timeout,
                    verify=verify,
                )
            else:
                resp = ctx.session.get(
                    url,
                    params=params,
                    timeout=ctx.timeout,
                    verify=verify,
                )
            content_type = resp.headers.get("content-type", "")
            if resp.status_code == 429:
                time.sleep(max(2.0, ctx.rate_sleep * 5) * (attempt + 1))
                continue
            if resp.status_code >= 400:
                if record_error:
                    ctx.errors.append(
                        {
                            "url": url,
                            "params": params,
                            "status_code": resp.status_code,
                            "body_head": resp.text[:500],
                        }
                    )
                return None
            if "json" not in content_type and not resp.text.lstrip().startswith(("{", "[")):
                if record_error:
                    ctx.errors.append(
                        {
                            "url": url,
                            "params": params,
                            "status_code": resp.status_code,
                            "body_head": resp.text[:500],
                            "error": "non_json_response",
                        }
                    )
                return None
            return resp.json()
        except Exception as exc:  # noqa: BLE001 - logged as data-quality metadata
            last_exc = f"{type(exc).__name__}: {exc}"
            time.sleep(ctx.rate_sleep * (attempt + 1))
    if record_error:
        ctx.errors.append({"url": url, "params": params, "error": last_exc})
    return None


def write_table(df: pd.DataFrame, path_base: Path) -> Path:
    path_base.parent.mkdir(parents=True, exist_ok=True)
    if df.empty:
        path = path_base.with_suffix(".csv")
        df.to_csv(path, index=False)
        return path
    try:
        path = path_base.with_suffix(".parquet")
        df.to_parquet(path, index=False)
        return path
    except Exception:
        path = path_base.with_suffix(".csv")
        df.to_csv(path, index=False)
        return path


def read_table(path_base: Path) -> pd.DataFrame:
    parquet = path_base.with_suffix(".parquet")
    csv = path_base.with_suffix(".csv")
    if parquet.exists():
        return pd.read_parquet(parquet)
    if csv.exists():
        return pd.read_csv(csv)
    raise FileNotFoundError(f"No table found for {path_base}")


def write_json(obj: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, default=str), encoding="utf-8")


def progress(items: Iterable[Any], desc: str) -> Iterable[Any]:
    if tqdm is None:
        return items
    return tqdm(items, desc=desc)


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)


def choose_polymarket_token(tokens: Any) -> tuple[str | None, str | None, bool | None]:
    if not isinstance(tokens, list) or not tokens:
        return None, None, None
    for token in tokens:
        outcome = str(token.get("outcome", "")).strip().lower()
        if outcome in {"yes", "y", "true"}:
            return str(token.get("token_id")), token.get("outcome"), token.get("winner")
    for token in tokens:
        outcome = str(token.get("outcome", "")).strip().lower()
        if outcome not in {"no", "n", "false"}:
            return str(token.get("token_id")), token.get("outcome"), token.get("winner")
    token = tokens[0]
    return str(token.get("token_id")), token.get("outcome"), token.get("winner")


def fetch_polymarket_gamma_markets(
    ctx: CollectorContext,
    *,
    max_pages: int | None,
    closed: bool | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    limit = 100
    offset = 0
    pages = 0
    while True:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if closed is not None:
            params["closed"] = str(closed).lower()
        data = request_json(ctx, f"{POLY_GAMMA_BASE}/markets", params=params, verify=ctx.polymarket_verify_tls)
        if not isinstance(data, list) or not data:
            break
        rows.extend(data)
        pages += 1
        if max_pages and pages >= max_pages:
            break
        offset += limit
        time.sleep(ctx.rate_sleep)
    return rows


def fetch_polymarket_clob_markets(
    ctx: CollectorContext,
    *,
    max_pages: int | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    next_cursor: str | None = None
    pages = 0
    while True:
        params = {"next_cursor": next_cursor} if next_cursor else None
        data = request_json(ctx, f"{POLY_CLOB_BASE}/markets", params=params, verify=ctx.polymarket_verify_tls)
        if not isinstance(data, dict):
            break
        batch = data.get("data") or []
        if not batch:
            break
        rows.extend(batch)
        pages += 1
        next_cursor = data.get("next_cursor")
        if max_pages and pages >= max_pages:
            break
        if not next_cursor or str(next_cursor).upper() in {"END", "LTE="}:
            break
        time.sleep(ctx.rate_sleep)
    return rows


def normalize_polymarket_markets(raw: list[dict[str, Any]], source: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for market in raw:
        if source == "gamma":
            tokens = market.get("tokens") or market.get("clobTokenIds") or []
            if isinstance(tokens, str):
                try:
                    tokens = json.loads(tokens)
                except Exception:
                    tokens = []
            token_id, target_outcome, resolved = choose_polymarket_token(tokens)
            condition_id = market.get("conditionId") or market.get("condition_id") or market.get("id")
            outcomes = market.get("outcomes")
            if isinstance(outcomes, str):
                try:
                    outcomes = json.loads(outcomes)
                except Exception:
                    pass
            rows.append(
                {
                    "platform": "polymarket",
                    "catalogue_source": source,
                    "contract_id": condition_id,
                    "slug": market.get("slug") or market.get("marketSlug"),
                    "question": market.get("question"),
                    "description": market.get("description"),
                    "start_time": market.get("startDate") or market.get("createdAt"),
                    "end_time": market.get("endDate") or market.get("endDateIso"),
                    "created_time": market.get("createdAt"),
                    "updated_time": market.get("updatedAt"),
                    "active": market.get("active"),
                    "closed": market.get("closed"),
                    "resolved": market.get("resolved"),
                    "resolved_time": market.get("resolvedAt"),
                    "volume_usd": as_float(market.get("volume") or market.get("volumeNum")),
                    "liquidity_usd": as_float(market.get("liquidity") or market.get("liquidityNum")),
                    "platform_category": compact_json(market.get("categories") or market.get("tags") or []),
                    "outcomes_json": compact_json(outcomes),
                    "tokens_json": compact_json(tokens),
                    "target_token_id": token_id,
                    "target_outcome": target_outcome,
                    "resolved_yes": resolved,
                    "raw_json": compact_json(market),
                }
            )
        else:
            tokens = market.get("tokens") or []
            token_id, target_outcome, resolved = choose_polymarket_token(tokens)
            rows.append(
                {
                    "platform": "polymarket",
                    "catalogue_source": source,
                    "contract_id": market.get("condition_id"),
                    "slug": market.get("market_slug"),
                    "question": market.get("question"),
                    "description": market.get("description"),
                    "start_time": market.get("accepting_order_timestamp"),
                    "end_time": market.get("end_date_iso") or market.get("game_start_time"),
                    "created_time": market.get("accepting_order_timestamp"),
                    "updated_time": None,
                    "active": market.get("active"),
                    "closed": market.get("closed"),
                    "resolved": market.get("closed"),
                    "resolved_time": market.get("end_date_iso"),
                    "volume_usd": as_float(market.get("volume") or market.get("volume_num")),
                    "liquidity_usd": as_float(market.get("liquidity") or market.get("liquidity_num")),
                    "platform_category": compact_json(market.get("tags") or []),
                    "outcomes_json": compact_json([t.get("outcome") for t in tokens]),
                    "tokens_json": compact_json(tokens),
                    "target_token_id": token_id,
                    "target_outcome": target_outcome,
                    "resolved_yes": resolved,
                    "raw_json": compact_json(market),
                }
            )
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.drop_duplicates(subset=["platform", "contract_id", "target_token_id"])
    return df


def fetch_polymarket_catalogue(
    ctx: CollectorContext,
    *,
    source: str,
    max_pages: int | None,
) -> pd.DataFrame:
    if source == "gamma":
        raw = fetch_polymarket_gamma_markets(ctx, max_pages=max_pages, closed=None)
        return normalize_polymarket_markets(raw, "gamma")
    if source == "clob":
        raw = fetch_polymarket_clob_markets(ctx, max_pages=max_pages)
        return normalize_polymarket_markets(raw, "clob")

    gamma = fetch_polymarket_gamma_markets(ctx, max_pages=1, closed=None)
    if gamma:
        if max_pages and max_pages <= 1:
            return normalize_polymarket_markets(gamma, "gamma")
        raw = gamma + fetch_polymarket_gamma_markets(
            ctx,
            max_pages=(max_pages - 1 if max_pages else None),
            closed=True,
        )
        return normalize_polymarket_markets(raw, "gamma")

    raw = fetch_polymarket_clob_markets(ctx, max_pages=max_pages)
    return normalize_polymarket_markets(raw, "clob")


def fetch_polymarket_price_history(
    ctx: CollectorContext,
    market: pd.Series,
    *,
    default_start: datetime,
    end_dt: datetime,
) -> list[dict[str, Any]]:
    token_id = market.get("target_token_id")
    if not token_id or str(token_id) == "nan":
        return []
    start_ts = to_unix(market.get("start_time"), default_start)
    end_ts = to_unix(market.get("end_time"), end_dt)
    if end_ts <= start_ts:
        end_ts = int(end_dt.timestamp())
    params = {
        "market": str(token_id),
        "startTs": start_ts,
        "endTs": end_ts,
        "interval": "1d",
        "fidelity": 1440,
    }
    data = request_json(ctx, f"{POLY_CLOB_BASE}/prices-history", params=params, verify=ctx.polymarket_verify_tls)
    history = data.get("history", []) if isinstance(data, dict) else []
    out: list[dict[str, Any]] = []
    for item in history:
        ts = as_float(item.get("t"))
        prob = as_float(item.get("p"))
        if ts is None or prob is None:
            continue
        out.append(
            {
                "platform": "polymarket",
                "contract_id": market.get("contract_id"),
                "token_id": str(token_id),
                "outcome": market.get("target_outcome"),
                "ts": int(ts),
                "date": datetime.fromtimestamp(int(ts), tz=UTC).date().isoformat(),
                "prob_yes": prob,
                "volume_usd": None,
                "open_interest": None,
                "raw_json": compact_json(item),
            }
        )
    return out


def parse_series_ticker(ticker: str | None) -> str | None:
    if not ticker:
        return None
    return str(ticker).split("-")[0]


def fetch_kalshi_markets_for_endpoint(
    ctx: CollectorContext,
    endpoint: str,
    *,
    status: str | None,
    max_pages: int | None,
    limit: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    pages = 0
    while True:
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        data = request_json(ctx, endpoint, params=params)
        if not isinstance(data, dict):
            break
        batch = data.get("markets") or []
        if not batch:
            break
        rows.extend(batch)
        pages += 1
        cursor = data.get("cursor")
        if max_pages and pages >= max_pages:
            break
        if not cursor:
            break
        time.sleep(ctx.rate_sleep)
    return rows


def fetch_kalshi_catalogue(
    ctx: CollectorContext,
    *,
    statuses: list[str],
    include_historical: bool,
    max_pages_per_status: int | None,
    limit: int,
) -> pd.DataFrame:
    raw: list[tuple[str, dict[str, Any]]] = []
    for status in statuses:
        endpoint = f"{KALSHI_BASE}/markets"
        for row in fetch_kalshi_markets_for_endpoint(
            ctx,
            endpoint,
            status=status,
            max_pages=max_pages_per_status,
            limit=limit,
        ):
            raw.append(("current", row))
    if include_historical:
        endpoint = f"{KALSHI_BASE}/historical/markets"
        for row in fetch_kalshi_markets_for_endpoint(
            ctx,
            endpoint,
            status=None,
            max_pages=max_pages_per_status,
            limit=limit,
        ):
            raw.append(("historical", row))

    rows: list[dict[str, Any]] = []
    for source, market in raw:
        ticker = market.get("ticker")
        rows.append(
            {
                "platform": "kalshi",
                "catalogue_source": source,
                "contract_id": ticker,
                "series_ticker": market.get("series_ticker") or parse_series_ticker(ticker),
                "event_ticker": market.get("event_ticker"),
                "slug": ticker,
                "question": market.get("title"),
                "description": market.get("rules_primary") or market.get("rules_secondary"),
                "start_time": market.get("open_time") or market.get("created_time"),
                "end_time": market.get("close_time") or market.get("expiration_time"),
                "created_time": market.get("created_time"),
                "updated_time": market.get("updated_time"),
                "active": market.get("status") == "active",
                "closed": market.get("status") in {"closed", "settled", "finalized"},
                "resolved": bool(market.get("result")),
                "resolved_time": market.get("expiration_time"),
                "volume_usd": as_float(market.get("volume_dollars") or market.get("volume_fp") or market.get("volume")),
                "liquidity_usd": as_float(market.get("liquidity_dollars") or market.get("liquidity")),
                "platform_category": market.get("category"),
                "outcomes_json": compact_json(["yes", "no"]),
                "tokens_json": compact_json({}),
                "target_token_id": ticker,
                "target_outcome": "yes",
                "resolved_yes": str(market.get("result", "")).strip().lower() == "yes",
                "status": market.get("status"),
                "yes_bid": as_float(market.get("yes_bid_dollars") or market.get("yes_bid")),
                "yes_ask": as_float(market.get("yes_ask_dollars") or market.get("yes_ask")),
                "last_price": as_float(market.get("last_price_dollars") or market.get("last_price")),
                "raw_json": compact_json(market),
            }
        )
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.drop_duplicates(subset=["platform", "contract_id"])
    return df


def candle_close_prob(candle: dict[str, Any]) -> float | None:
    price = candle.get("price") or {}
    close = nested_float(price, "close_dollars", "close")
    if close is not None:
        return close
    yes_bid = nested_float(candle.get("yes_bid"), "close_dollars", "close")
    yes_ask = nested_float(candle.get("yes_ask"), "close_dollars", "close")
    if yes_bid is not None and yes_ask is not None:
        return (yes_bid + yes_ask) / 2.0
    return yes_bid if yes_bid is not None else yes_ask


def fetch_kalshi_batch_candles(
    ctx: CollectorContext,
    markets: list[pd.Series],
    *,
    default_start: datetime,
    end_dt: datetime,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    tickers = [str(m.get("contract_id")) for m in markets if m.get("contract_id")]
    if not tickers:
        return rows
    start_ts = min(to_unix(m.get("start_time"), default_start) for m in markets)
    params = {
        "market_tickers": ",".join(tickers),
        "start_ts": start_ts,
        "end_ts": int(end_dt.timestamp()),
        "period_interval": 1440,
    }
    data = request_json(
        ctx,
        f"{KALSHI_BASE}/markets/candlesticks",
        params=params,
        record_error=len(markets) <= 1,
    )
    if not isinstance(data, dict) and len(markets) > 1:
        midpoint = len(markets) // 2
        return fetch_kalshi_batch_candles(
            ctx,
            markets[:midpoint],
            default_start=default_start,
            end_dt=end_dt,
        ) + fetch_kalshi_batch_candles(
            ctx,
            markets[midpoint:],
            default_start=default_start,
            end_dt=end_dt,
        )
    returned = data.get("markets", []) if isinstance(data, dict) else []
    for market_data in returned:
        ticker = market_data.get("market_ticker") or market_data.get("ticker")
        for candle in market_data.get("candlesticks", []) or []:
            ts = as_float(candle.get("end_period_ts"))
            prob = candle_close_prob(candle)
            if ts is None or prob is None:
                continue
            rows.append(
                {
                    "platform": "kalshi",
                    "contract_id": ticker,
                    "token_id": ticker,
                    "outcome": "yes",
                    "ts": int(ts),
                    "date": datetime.fromtimestamp(int(ts), tz=UTC).date().isoformat(),
                    "prob_yes": prob,
                    "volume_usd": as_float(candle.get("volume_fp") or candle.get("volume")),
                    "open_interest": as_float(candle.get("open_interest_fp") or candle.get("open_interest")),
                    "raw_json": compact_json(candle),
                }
            )
    return rows


def fetch_kalshi_historical_candles(
    ctx: CollectorContext,
    market: pd.Series,
    *,
    default_start: datetime,
    end_dt: datetime,
) -> list[dict[str, Any]]:
    ticker = market.get("contract_id")
    if not ticker or str(ticker) == "nan":
        return []
    params = {
        "start_ts": to_unix(market.get("start_time"), default_start),
        "end_ts": to_unix(market.get("end_time"), end_dt),
        "period_interval": 1440,
    }
    if params["end_ts"] <= params["start_ts"]:
        params["end_ts"] = int(end_dt.timestamp())
    data = request_json(ctx, f"{KALSHI_BASE}/historical/markets/{ticker}/candlesticks", params=params)
    candles = data.get("candlesticks", []) if isinstance(data, dict) else []
    rows: list[dict[str, Any]] = []
    for candle in candles:
        ts = as_float(candle.get("end_period_ts"))
        prob = candle_close_prob(candle)
        if ts is None or prob is None:
            continue
        rows.append(
            {
                "platform": "kalshi",
                "contract_id": ticker,
                "token_id": ticker,
                "outcome": "yes",
                "ts": int(ts),
                "date": datetime.fromtimestamp(int(ts), tz=UTC).date().isoformat(),
                "prob_yes": prob,
                "volume_usd": as_float(candle.get("volume_fp") or candle.get("volume")),
                "open_interest": as_float(candle.get("open_interest_fp") or candle.get("open_interest")),
                "raw_json": compact_json(candle),
            }
        )
    return rows


def keyword_in_text(text: str, keyword: str) -> bool:
    escaped = re.escape(keyword.lower())
    if " " in keyword:
        return keyword.lower() in text
    return re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", text) is not None


def categorize_text(question: Any, description: Any = None) -> tuple[str, str]:
    text = f"{question or ''} {description or ''}".lower()
    if not text.strip():
        return "OTHER", ""
    crypto_asset = re.search(r"(?<![a-z0-9])(bitcoin|btc|ethereum|eth|solana|sol|xrp|ripple|doge|dogecoin)(?![a-z0-9])", text)
    price_contract = re.search(r"(?<![a-z0-9])(price|above|below|greater than|less than|at least|under|over)(?![a-z0-9])", text)
    if crypto_asset and price_contract:
        return "CRYPTO_PRICE", crypto_asset.group(1)
    scores: dict[str, int] = {}
    hits: dict[str, list[str]] = {}
    for category, words in KEYWORDS.items():
        found = [word for word in words if keyword_in_text(text, word)]
        if found:
            scores[category] = len(found)
            hits[category] = found
    if not scores:
        return "OTHER", ""
    category = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    return category, ",".join(hits[category][:10])


def match_asset(row: pd.Series) -> tuple[str | None, str, str]:
    category = row.get("category") or "OTHER"
    text = f"{row.get('question') or ''} {row.get('description') or ''}".lower()
    if category == "CORP":
        for name, ticker in COMMON_COMPANY_TICKERS.items():
            if name in text:
                return ticker, "keyword_company", f"Matched company keyword: {name}"
        ticker_match = re.search(r"\$([A-Z]{1,5})(?:\b|[^A-Za-z])", f"{row.get('question') or ''} {row.get('description') or ''}")
        if ticker_match:
            return ticker_match.group(1), "cashtag", "Matched cashtag in contract text."
        return None, "needs_manual_review", "Corporate contract needs company-to-ticker match."
    mapping = CATEGORY_ASSET_MAP.get(str(category), CATEGORY_ASSET_MAP["OTHER"])
    return mapping["primary"], "category_primary", mapping["rationale"]


def categorize_contracts(contracts: pd.DataFrame) -> pd.DataFrame:
    if contracts.empty:
        return contracts.copy()
    df = contracts.copy()
    cats = df.apply(lambda r: categorize_text(r.get("question"), r.get("description")), axis=1)
    df["category"] = [x[0] for x in cats]
    df["category_keyword_hits"] = [x[1] for x in cats]
    matches = df.apply(match_asset, axis=1)
    df["asset_ticker"] = [x[0] for x in matches]
    df["asset_match_method"] = [x[1] for x in matches]
    df["asset_match_rationale"] = [x[2] for x in matches]
    df["wash_trade_flag_contract_window"] = (
        (df["platform"] == "polymarket")
        & pd.to_datetime(df["end_time"], errors="coerce").dt.date.between(date(2024, 10, 1), date(2024, 12, 31))
    )
    return df


def fetch_asset_returns(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    if not tickers:
        return pd.DataFrame()
    try:
        import yfinance as yf
    except Exception:
        return pd.DataFrame()

    rows: list[pd.DataFrame] = []
    for ticker in progress(tickers, "asset prices"):
        try:
            data = yf.download(ticker, start=start, end=end, auto_adjust=False, progress=False, threads=False)
        except Exception:
            continue
        if data is None or data.empty:
            continue
        if isinstance(data.columns, pd.MultiIndex):
            if ticker in data.columns.get_level_values(-1):
                data = data.xs(ticker, axis=1, level=-1, drop_level=True)
            elif ticker in data.columns.get_level_values(0):
                data = data.xs(ticker, axis=1, level=0, drop_level=True)
        close_col = "Adj Close" if "Adj Close" in data.columns else "Close"
        if close_col not in data.columns:
            continue
        out = pd.DataFrame(
            {
                "asset_ticker": ticker,
                "date": [d.isoformat() for d in pd.to_datetime(data.index).date],
                "asset_close": pd.to_numeric(data[close_col], errors="coerce"),
                "asset_volume": pd.to_numeric(data["Volume"], errors="coerce") if "Volume" in data.columns else np.nan,
            }
        )
        out["asset_return"] = np.log(out["asset_close"] / out["asset_close"].shift(1))
        out["asset_return_1d"] = out["asset_return"].shift(-1)
        out["asset_return_5d"] = np.log(out["asset_close"].shift(-5) / out["asset_close"])
        rows.append(out)
        time.sleep(0.15)
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)


def build_panel(price_history: pd.DataFrame, contracts: pd.DataFrame, asset_returns: pd.DataFrame) -> pd.DataFrame:
    if price_history.empty or contracts.empty:
        return pd.DataFrame()
    cols = [
        "platform",
        "contract_id",
        "category",
        "asset_ticker",
        "question",
        "start_time",
        "end_time",
        "volume_usd",
        "liquidity_usd",
        "resolved_yes",
    ]
    available_cols = [c for c in cols if c in contracts.columns]
    df = price_history.merge(
        contracts[available_cols],
        on=["platform", "contract_id"],
        how="left",
        suffixes=("", "_contract"),
    )
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date.astype(str)
    df = df.sort_values(["platform", "contract_id", "date"])
    df["delta_prob"] = df.groupby(["platform", "contract_id"])["prob_yes"].diff()
    start_dt = pd.to_datetime(df["start_time"], errors="coerce", utc=True)
    end_dt = pd.to_datetime(df["end_time"], errors="coerce", utc=True)
    obs_dt = pd.to_datetime(df["date"], errors="coerce", utc=True)
    df["contract_duration"] = (end_dt - start_dt).dt.days
    df["days_to_expiry"] = (end_dt - obs_dt).dt.days
    df["wash_trade_flag"] = (
        (df["platform"] == "polymarket")
        & pd.to_datetime(df["date"], errors="coerce").dt.date.between(date(2024, 10, 1), date(2024, 12, 31))
    )
    if not asset_returns.empty:
        df = df.merge(asset_returns, on=["asset_ticker", "date"], how="left")
    return df


def filter_panel(panel: pd.DataFrame) -> pd.DataFrame:
    if panel.empty:
        return panel.copy()
    df = panel.copy()
    if "contract_duration" in df.columns:
        df = df[(df["contract_duration"].isna()) | (df["contract_duration"] > 7)]
    if "category" in df.columns:
        df = df[df["category"] != "CRYPTO_PRICE"]
    if "wash_trade_flag" in df.columns:
        df = df[~df["wash_trade_flag"].fillna(False)]
    obs = df.groupby(["platform", "contract_id"])["prob_yes"].transform("count")
    df = df[obs >= 2]
    if "delta_prob" in df.columns and df["delta_prob"].notna().sum() > 20:
        lo, hi = df["delta_prob"].quantile([0.01, 0.99])
        df["delta_prob_winsor"] = df["delta_prob"].clip(lo, hi)
    else:
        df["delta_prob_winsor"] = df.get("delta_prob")
    return df


def summarize_outputs(contracts: pd.DataFrame, price_history: pd.DataFrame, panel: pd.DataFrame) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "contracts": int(len(contracts)),
        "price_rows": int(len(price_history)),
        "panel_rows": int(len(panel)),
    }
    if not contracts.empty:
        summary["contracts_by_platform"] = contracts["platform"].value_counts(dropna=False).to_dict()
        if "category" in contracts:
            summary["contracts_by_category"] = contracts["category"].value_counts(dropna=False).to_dict()
    if not price_history.empty:
        summary["price_rows_by_platform"] = price_history["platform"].value_counts(dropna=False).to_dict()
        summary["price_date_min"] = str(price_history["date"].min())
        summary["price_date_max"] = str(price_history["date"].max())
        summary["contracts_with_prices"] = int(price_history[["platform", "contract_id"]].drop_duplicates().shape[0])
    if not panel.empty and "asset_ticker" in panel:
        summary["panel_assets"] = sorted([str(x) for x in panel["asset_ticker"].dropna().unique()])
    return summary


def select_price_markets(
    contracts: pd.DataFrame,
    max_price_markets: int | None,
    history_categories: list[str] | None,
) -> pd.DataFrame:
    if contracts.empty:
        return contracts
    df = contracts.copy()
    df["_has_target"] = df["target_token_id"].notna() & (df["target_token_id"].astype(str) != "nan")
    if history_categories:
        scoped = df[df.get("category", pd.Series(dtype=str)).isin(history_categories)]
        if len(scoped) >= (max_price_markets or 1):
            df = scoped.copy()
    df["_category_rank"] = df.get("category", pd.Series(["OTHER"] * len(df))).map(lambda c: 1 if c != "OTHER" else 2)
    start_dt = pd.to_datetime(df.get("start_time"), errors="coerce", utc=True)
    end_dt = pd.to_datetime(df.get("end_time"), errors="coerce", utc=True)
    df["_duration_sort"] = (end_dt - start_dt).dt.days
    long_enough = df[df["_has_target"] & (df["_duration_sort"].fillna(0) >= 7)]
    if max_price_markets and len(long_enough) >= max_price_markets:
        df = long_enough.copy()
    if "volume_usd" in df.columns:
        df["_volume_sort"] = pd.to_numeric(df["volume_usd"], errors="coerce").fillna(-1)
    else:
        df["_volume_sort"] = -1
    df = df[df["_has_target"]].sort_values(
        ["_category_rank", "_volume_sort", "_duration_sort", "contract_id"],
        ascending=[True, False, False, True],
    )
    if max_price_markets:
        df = df.head(max_price_markets)
    return df.drop(columns=[c for c in ["_has_target", "_category_rank", "_volume_sort", "_duration_sort"] if c in df.columns])


def run_collection(args: argparse.Namespace) -> dict[str, Any]:
    out_dir = args.out_dir
    raw_dir = out_dir / "raw"
    processed_dir = out_dir / "processed"
    summary_dir = out_dir / "summary"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    summary_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": args.user_agent})
    ctx = CollectorContext(
        out_dir=out_dir,
        session=session,
        timeout=args.timeout,
        rate_sleep=args.rate_sleep,
        polymarket_verify_tls=not args.insecure_polymarket,
        errors=[],
    )

    contracts_parts: list[pd.DataFrame] = []
    if "polymarket" in args.platforms:
        print(f"[collect] Polymarket catalogue source={args.polymarket_source}", flush=True)
        poly = fetch_polymarket_catalogue(ctx, source=args.polymarket_source, max_pages=args.max_polymarket_pages)
        write_table(poly, raw_dir / "polymarket_markets_catalogue")
        contracts_parts.append(poly)
        print(f"[collect] Polymarket contracts={len(poly)}", flush=True)

    if "kalshi" in args.platforms:
        print("[collect] Kalshi catalogue", flush=True)
        kalshi = fetch_kalshi_catalogue(
            ctx,
            statuses=args.kalshi_statuses,
            include_historical=args.include_kalshi_historical,
            max_pages_per_status=args.max_kalshi_pages,
            limit=args.kalshi_limit,
        )
        write_table(kalshi, raw_dir / "kalshi_markets_catalogue")
        contracts_parts.append(kalshi)
        print(f"[collect] Kalshi contracts={len(kalshi)}", flush=True)

    contracts = pd.concat(contracts_parts, ignore_index=True) if contracts_parts else pd.DataFrame()
    contracts = categorize_contracts(contracts)
    write_table(contracts, processed_dir / "contracts_categorized")

    default_start = datetime.fromisoformat(args.start_date).replace(tzinfo=UTC)
    end_dt = parse_dt(args.end_date) or utc_now()
    price_rows: list[dict[str, Any]] = []

    if not args.catalogue_only and not contracts.empty:
        selected = select_price_markets(contracts, args.max_price_markets, args.history_categories)
        print(f"[collect] Price histories target_contracts={len(selected)}", flush=True)
        poly_selected = selected[selected["platform"] == "polymarket"]
        for _, market in progress(poly_selected.iterrows(), "polymarket prices"):
            price_rows.extend(fetch_polymarket_price_history(ctx, market, default_start=default_start, end_dt=end_dt))
            time.sleep(ctx.rate_sleep)

        kalshi_selected = selected[selected["platform"] == "kalshi"]
        current = kalshi_selected[kalshi_selected["catalogue_source"] != "historical"]
        historical = kalshi_selected[kalshi_selected["catalogue_source"] == "historical"]
        for i in progress(range(0, len(current), 100), "kalshi current prices"):
            chunk = [row for _, row in current.iloc[i : i + 100].iterrows()]
            price_rows.extend(fetch_kalshi_batch_candles(ctx, chunk, default_start=default_start, end_dt=end_dt))
            time.sleep(ctx.rate_sleep)
        for _, market in progress(historical.iterrows(), "kalshi historical prices"):
            price_rows.extend(fetch_kalshi_historical_candles(ctx, market, default_start=default_start, end_dt=end_dt))
            time.sleep(ctx.rate_sleep)

    price_history = pd.DataFrame(price_rows)
    if not price_history.empty:
        price_history = price_history.drop_duplicates(subset=["platform", "contract_id", "date", "token_id"])
    write_table(price_history, raw_dir / "prediction_market_price_history")

    asset_returns = pd.DataFrame()
    if not args.catalogue_only and not args.skip_assets:
        tickers = sorted(
            {
                str(t)
                for t in contracts.get("asset_ticker", pd.Series(dtype=str)).dropna().unique()
                if str(t) and str(t).lower() != "nan"
            }
        )
        print(f"[collect] Asset returns tickers={len(tickers)}", flush=True)
        asset_returns = fetch_asset_returns(tickers, args.asset_start or args.start_date, args.asset_end or end_dt.date().isoformat())
    write_table(asset_returns, processed_dir / "asset_returns")

    panel = build_panel(price_history, contracts, asset_returns)
    write_table(panel, processed_dir / "panel_full")
    filtered = filter_panel(panel)
    write_table(filtered, processed_dir / "panel_filtered")

    if not contracts.empty and "category" in contracts:
        contracts["category"].value_counts(dropna=False).rename_axis("category").reset_index(name="contracts").to_csv(
            summary_dir / "contract_counts_by_category.csv",
            index=False,
        )
    if not contracts.empty and "volume_usd" in contracts:
        contracts[["platform", "contract_id", "volume_usd", "liquidity_usd"]].to_csv(
            summary_dir / "liquidity_distribution.csv",
            index=False,
        )
    if not price_history.empty:
        price_history.groupby("platform")["date"].agg(["min", "max", "count"]).reset_index().to_csv(
            summary_dir / "coverage_dates.csv",
            index=False,
        )

    summary = summarize_outputs(contracts, price_history, panel)
    summary["filtered_panel_rows"] = int(len(filtered))
    summary["errors"] = ctx.errors[:200]
    summary["error_count"] = len(ctx.errors)
    summary["generated_at_utc"] = utc_now().isoformat()
    summary["args"] = vars(args) | {"out_dir": str(args.out_dir)}
    write_json(summary, summary_dir / "manifest.json")
    print(json.dumps(summary, indent=2, default=str)[:4000], flush=True)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data_lake/prediction_markets"),
        help="Output directory for raw, processed, and summary files.",
    )
    parser.add_argument(
        "--platforms",
        nargs="+",
        choices=["polymarket", "kalshi"],
        default=["polymarket", "kalshi"],
    )
    parser.add_argument(
        "--polymarket-source",
        choices=["auto", "gamma", "clob"],
        default="auto",
        help="Gamma is richer, but CLOB is accessible from more networks and includes token IDs.",
    )
    parser.add_argument("--kalshi-statuses", nargs="+", default=["open", "closed", "settled"])
    parser.add_argument("--include-kalshi-historical", action="store_true", default=True)
    parser.add_argument("--no-kalshi-historical", dest="include_kalshi_historical", action="store_false")
    parser.add_argument("--kalshi-limit", type=int, default=1000)
    parser.add_argument("--max-polymarket-pages", type=int, default=None)
    parser.add_argument("--max-kalshi-pages", type=int, default=None)
    parser.add_argument("--max-price-markets", type=int, default=100)
    parser.add_argument(
        "--history-categories",
        nargs="*",
        default=[
            "MACRO_FED",
            "MACRO_CPI",
            "MACRO_GDP",
            "POL_US",
            "POL_GEO",
            "REG_CRYPTO",
            "REG_SECTOR",
            "CORP",
            "TRADE",
        ],
        help="Contract categories to fetch price histories for. Empty means all categories.",
    )
    parser.add_argument("--catalogue-only", action="store_true")
    parser.add_argument("--skip-assets", action="store_true")
    parser.add_argument("--start-date", default=DEFAULT_START_DATE)
    parser.add_argument("--end-date", default=None)
    parser.add_argument("--asset-start", default=None)
    parser.add_argument("--asset-end", default=None)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--rate-sleep", type=float, default=0.25)
    parser.add_argument("--user-agent", default=os.environ.get("PM_COLLECTOR_USER_AGENT", DEFAULT_USER_AGENT))
    parser.add_argument(
        "--insecure-polymarket",
        action="store_true",
        help="Disable TLS verification only for Polymarket endpoints. Useful behind some local intercepting networks.",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Small endpoint and pipeline validation run.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.smoke:
        args.out_dir = args.out_dir / "smoke"
        args.max_polymarket_pages = args.max_polymarket_pages or 1
        args.max_kalshi_pages = args.max_kalshi_pages or 1
        args.kalshi_limit = min(args.kalshi_limit, 200)
        args.max_price_markets = min(args.max_price_markets or 10, 10)
        args.skip_assets = True
    run_collection(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
