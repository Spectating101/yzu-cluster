#!/usr/bin/env python3
"""Build a lightweight crypto news/event context panel.

This collector stores article metadata, factor tags, and price reactions. It
does not copy full articles.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from collections import Counter
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_UNIVERSE = Path("data_lake/crypto_pipeline/context/current_regime_top500_model_panel.csv")
DEFAULT_PRICE_PANEL = Path("data_lake/crypto_pipeline/exports/price_panel_clean.csv")
DEFAULT_OUT_DIR = Path("data_lake/crypto_pipeline/news_context")
DEFAULT_REPORT = Path("reports/CRYPTO_NEWS_CONTEXT_PANEL.md")

FACTOR_KEYWORDS = {
    "regulatory": [
        "sec",
        "cftc",
        "mica",
        "regulat",
        "lawsuit",
        "enforcement",
        "approval",
        "etf",
        "court",
        "settlement",
    ],
    "institutional_flow": [
        "blackrock",
        "fidelity",
        "grayscale",
        "etf",
        "treasury",
        "institutional",
        "custody",
        "fund",
        "aum",
    ],
    "product_or_upgrade": [
        "upgrade",
        "mainnet",
        "testnet",
        "launch",
        "roadmap",
        "release",
        "protocol",
        "hard fork",
        "integration",
    ],
    "adoption_or_partnership": [
        "partner",
        "partnership",
        "adoption",
        "integrates",
        "integration",
        "users",
        "transactions",
        "payment",
    ],
    "security_or_trust": [
        "hack",
        "exploit",
        "breach",
        "attack",
        "depeg",
        "reserve",
        "insolven",
        "fraud",
        "phishing",
    ],
    "supply_or_unlock": [
        "unlock",
        "emission",
        "airdrop",
        "burn",
        "mint",
        "supply",
        "dilution",
        "vesting",
    ],
    "exchange_or_liquidity": [
        "listing",
        "delisting",
        "binance",
        "coinbase",
        "kraken",
        "okx",
        "bybit",
        "liquidity",
        "volume",
    ],
    "macro_or_risk": [
        "fed",
        "rates",
        "inflation",
        "dollar",
        "risk assets",
        "tariff",
        "recession",
        "liquidity",
    ],
}

CRYPTO_TERMS = {
    "crypto",
    "blockchain",
    "token",
    "coin",
    "defi",
    "onchain",
    "on-chain",
    "web3",
    "stablecoin",
    "etf",
    "exchange",
    "wallet",
    "protocol",
    "mainnet",
    "bitcoin",
    "ethereum",
    "solana",
    "avalanche",
    "chainlink",
    "btc",
    "eth",
    "sol",
    "avax",
    "link",
}
CRYPTO_SOURCES = {
    "CoinDesk",
    "Cointelegraph",
    "Decrypt",
    "The Block",
    "CryptoSlate",
    "Blockworks",
    "Bitcoin.com",
    "CoinMarketCap",
    "Binance",
    "Coinbase",
    "Kraken",
    "MEXC",
}
SOURCE_QUALITY = {
    "CoinDesk": "high",
    "CryptoSlate": "high",
    "The Block": "high",
    "Cointelegraph": "medium",
    "CoinTelegraph": "high",
    "Blockworks": "medium",
    "Bitcoin.com": "low",
    "CoinMarketCap": "high",
    "Binance": "medium",
    "Coinbase": "high",
    "Kraken": "high",
    "MEXC": "low",
    "CoinGecko": "high",
    "CoinStats": "low",
    "Cointelegraph": "medium",
    "Reuters": "high",
    "Bloomberg": "high",
    "Yahoo Finance": "medium",
    "Yahoo": "medium",
    "YahooFinance": "medium",
    "coindesk.com": "high",
    "cointelegraph.com": "high",
    "decrypt.co": "medium",
}
OBVIOUS_NON_CRYPTO_TERMS = {
    "nhl",
    "hockey",
    "colorado avalanche",
    "los angeles kings",
    "stanley cup",
}
GENERIC_SEO_TERMS = {
    "price prediction",
    "price today",
    "price explained",
    "live price",
    "what is",
    "how it works",
    "guide",
    "complete guide",
    "how much is",
    "how many",
    "better crypto buy",
    "want to be a millionaire",
    "millionaire crypto",
    "which has more upside",
}
NEGATIVE_WORDS = {
    "hack",
    "exploit",
    "breach",
    "lawsuit",
    "enforcement",
    "delisting",
    "fraud",
    "depeg",
    "falls",
    "drops",
    "plunge",
    "selloff",
    "probe",
}
POSITIVE_WORDS = {
    "approval",
    "approves",
    "launch",
    "partnership",
    "integrates",
    "upgrade",
    "listing",
    "rally",
    "surge",
    "adoption",
    "fund",
}

QUERY_TEMPLATE_LEVELS = {
    "light": [
        "{name} {symbol} crypto",
    ],
    "standard": [
        "{name} {symbol} crypto",
        "{name} {symbol} partnerships",
        "{name} {symbol} upgrade",
        "{name} {symbol} ETF",
        "{name} {symbol} hack",
    ],
    "deep": [
        "{name} {symbol} crypto",
        "{name} {symbol} partnership",
        "{name} {symbol} partnerships",
        "{name} {symbol} upgrade",
        "{name} {symbol} protocol",
        "{name} {symbol} upgrade",
        "{name} {symbol} ETF",
        "{name} {symbol} listing",
        "{name} {symbol} delisting",
        "{name} {symbol} reserve",
        "{name} {symbol} legal",
        "{name} {symbol} regulation",
        "{name} {symbol} hack",
        "{name} {symbol} treasury",
        "{name} {symbol} integration",
        "{name} {symbol} adoption",
    ],
}

FALLBACK_RSS_FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "Cointelegraph": "https://cointelegraph.com/rss",
    "Decrypt": "https://decrypt.co/feed",
}

YF_TICKER_SUFFIXES = ("-USD",)


def _normalize_url(url: str) -> str:
    if not url:
        return ""
    parts = urllib.parse.urlsplit(url)
    if not (parts.scheme and parts.netloc):
        return url.strip()
    params = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    keep = [(k, v) for k, v in params if not k.lower().startswith("utm_")]
    query = urllib.parse.urlencode(keep, doseq=True)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _parse_dt(text: str) -> str:
    try:
        dt = parsedate_to_datetime(text)
    except Exception:
        dt = None
    if dt is None:
        try:
            t = str(text).strip()
            if t and t.isdigit():
                dt = datetime.fromtimestamp(int(t), tz=timezone.utc)
            else:
                dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
        except Exception:
            return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def build_query_plan(coin: dict[str, str], depth: str) -> list[str]:
    templates = QUERY_TEMPLATE_LEVELS.get(depth, QUERY_TEMPLATE_LEVELS["standard"])
    name = (coin.get("name") or "").strip() or coin["coingecko_id"]
    symbol = (coin.get("symbol") or "").strip() or coin["coingecko_id"]
    out: list[str] = []
    for template in templates:
        q = template.format(name=name, symbol=symbol)
        q = f'"{q}" -NHL -hockey'
        if q not in out:
            out.append(q)
    return out


def _google_news_url(query: str, days: int) -> str:
    q = f"{query} when:{int(days)}d"
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    )


def _strip_domain_from_url(url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url)
        return (parsed.scheme or "https") + "://" + (parsed.netloc or "").lower() + parsed.path
    except Exception:
        return url


def _feed_source_from_url(url: str) -> str:
    cleaned = _strip_domain_from_url(url).lower()
    if cleaned.startswith("https://cointelegraph.com"):
        return "Cointelegraph"
    if cleaned.startswith("https://www.cointelegraph.com"):
        return "Cointelegraph"
    if cleaned.startswith("https://decrypt.co"):
        return "Decrypt"
    if cleaned.startswith("https://www.coindesk.com"):
        return "CoinDesk"
    return "Crypto RSS"


def _resolve_event_url(item: dict[str, str], default_host: str) -> str:
    for key in ("canonicalUrl", "clickThroughUrl", "url"):
        val = item.get(key)
        if isinstance(val, dict):
            nested_url = val.get("url")
            if nested_url:
                return str(nested_url)
        if isinstance(val, str) and val:
            return val
    return f"https://{default_host}"


def _source_quality(source: str, url: str) -> str:
    direct = SOURCE_QUALITY.get(source, "unknown")
    if direct != "unknown":
        return direct
    host = urllib.parse.urlsplit(url).netloc.lower().replace("www.", "")
    return SOURCE_QUALITY.get(host, "unknown")


def _make_deduped_event(
    article: dict[str, Any],
    coin: dict[str, str],
    seen: set[str],
    existing_event_ids: set[str],
    existing_urls: set[str],
    min_factor_score: int,
    query_depth: str,
):
    norm_url = _normalize_url(article.get("url", ""))
    if not norm_url:
        return None
    dedupe_key = hashlib.sha256(f"{coin['coingecko_id']}|{article['title']}|{norm_url}".encode()).hexdigest()[:16]
    if dedupe_key in seen:
        return None
    if dedupe_key in existing_event_ids or norm_url in existing_urls:
        return None
    factor, direction, factor_score = classify_event(article["title"], article.get("snippet", ""))
    if factor_score < int(min_factor_score):
        return None
    source_val = str(article.get("source", ""))
    return {
        "event_id": dedupe_key,
        **coin,
        **article,
        "url": norm_url,
        "factor": factor,
        "direction": direction,
        "factor_score": factor_score,
        "query_depth": query_depth,
        "source_quality": _source_quality(source_val, norm_url),
        "title_slug": _slug(article["title"])[:120],
        "collected_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


def _extract_yf_item_parts(item: dict[str, Any]) -> tuple[str, str, str, str]:
    content = item.get("content") or {}
    title = str(content.get("title") or item.get("title") or "").strip()
    snippet = str(content.get("summary") or content.get("description") or item.get("description") or "").strip()
    published = str(content.get("pubDate") or item.get("publishedDate") or item.get("providerPublishTime") or "").strip()
    provider = item.get("provider") or {}
    source = str((provider.get("displayName") if isinstance(provider, dict) else "") or "Yahoo Finance").strip()
    return title, _clean(snippet), published, source


def _coin_terms(coin: dict[str, str]) -> set[str]:
    terms = {
        coin.get("coingecko_id", "").replace("-", " ").lower(),
        coin.get("name", "").lower(),
    }
    symbol = coin.get("symbol", "").strip().lower()
    if len(symbol) >= 3:
        terms.add(symbol)
    return {term for term in terms if term}


def relevant_article(article: dict[str, str], coin: dict[str, str]) -> bool:
    text = f"{article.get('title', '')} {article.get('snippet', '')}".lower()
    source = article.get("source", "")
    if any(term in text for term in OBVIOUS_NON_CRYPTO_TERMS) and not any(term in text for term in CRYPTO_TERMS):
        return False
    has_event_factor = any(
        keyword in text
        for factor, keywords in FACTOR_KEYWORDS.items()
        if factor != "macro_or_risk"
        for keyword in keywords
    )
    if any(term in text for term in GENERIC_SEO_TERMS) and not has_event_factor:
        return False
    source_is_crypto = source in CRYPTO_SOURCES
    mentions_coin = any(term in text for term in _coin_terms(coin))
    mentions_crypto = any(term in text for term in CRYPTO_TERMS)
    return mentions_coin and (mentions_crypto or source_is_crypto)


def fetch_google_news(query: str, days: int, limit: int, sleep_s: float) -> list[dict[str, str]]:
    url = _google_news_url(query, days)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 research-context-builder"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = resp.read()
    root = ET.fromstring(payload)
    rows: list[dict[str, str]] = []
    for item in root.findall(".//item")[:limit]:
        title = _clean(item.findtext("title", ""))
        link = _clean(item.findtext("link", ""))
        published_at = _parse_dt(item.findtext("pubDate", ""))
        source = ""
        source_el = item.find("source")
        if source_el is not None and source_el.text:
            source = _clean(source_el.text)
        rows.append(
            {
                "query": query,
                "title": title,
                "url": link,
                "source": source,
                "published_at": published_at,
                "snippet": _clean(item.findtext("description", ""))[:500],
            }
        )
    if sleep_s > 0:
        time.sleep(float(sleep_s))
    return rows


def fetch_feed_news(feed_name: str, feed_url: str, days: int, limit: int) -> list[dict[str, str]]:
    req = urllib.request.Request(feed_url, headers={"User-Agent": "Mozilla/5.0 research-context-builder"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = resp.read()
    root = ET.fromstring(payload)
    since = pd.Timestamp.utcnow() - pd.Timedelta(days=int(days))
    rows: list[dict[str, str]] = []
    for item in root.findall(".//item")[: max(1, int(limit) * 2)]:
        title = _clean(item.findtext("title", ""))
        link = _clean(item.findtext("link", ""))
        published_at = _parse_dt(item.findtext("pubDate", ""))
        if not published_at:
            continue
        try:
            if pd.to_datetime(published_at) < since:
                continue
        except Exception:
            pass
        source = _feed_source_from_url(link) or feed_name
        rows.append(
            {
                "query": f"feed:{feed_name}",
                "title": title,
                "url": link,
                "source": source,
                "published_at": published_at,
                "snippet": _clean(item.findtext("description", ""))[:500],
            }
        )
        if len(rows) >= int(limit):
            break
    return rows


def _yf_ticker_candidates(coin: dict[str, str]) -> list[str]:
    symbol = coin.get("symbol", "").strip().upper()
    name = coin.get("name", "").strip()
    candidates: list[str] = []
    if symbol:
        for suffix in YF_TICKER_SUFFIXES:
            candidates.append(f"{symbol}{suffix}")
        if len(symbol) <= 5:
            candidates.append(f"{symbol}USD")
    if name:
        candidates.append(f"{name}-USD")
    unique = []
    for t in candidates:
        if t and t not in unique:
            unique.append(t)
    return unique


def fetch_yfinance_news(coin: dict[str, str], days: int, limit: int) -> list[dict[str, str]]:
    try:
        import yfinance as yf
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"yfinance not available: {exc}") from exc

    rows: list[dict[str, str]] = []
    cutoff = pd.Timestamp.utcnow() - pd.Timedelta(days=int(days))
    for ticker in _yf_ticker_candidates(coin):
        try:
            raw = yf.Ticker(ticker).news or []
        except Exception as exc:
            # Keep collector robust; some symbols are simply unavailable.
            continue
        for item in raw[: int(limit)]:
            title, snippet, published_raw, source = _extract_yf_item_parts(item)
            if not title:
                continue
            published_at = _parse_dt(published_raw)
            if not published_at:
                continue
            try:
                if pd.to_datetime(published_at) < cutoff:
                    continue
            except Exception:
                pass
            content = item.get("content") or {}
            url = _resolve_event_url(item, "finance.yahoo.com")
            if not url:
                url = _resolve_event_url(content, "finance.yahoo.com")
            if not url:
                continue
            if not url.startswith("http"):
                if source and source.lower().startswith("yahoo"):
                    pass
            source_val = source or "Yahoo Finance"
            rows.append(
                {
                    "query": f"yf:{ticker}",
                    "title": _clean(title),
                    "url": _normalize_url(url),
                    "source": source_val,
                    "published_at": published_at,
                    "snippet": _clean(snippet)[:500],
                }
            )
            if len(rows) >= int(limit):
                break
        if len(rows) >= int(limit):
            break
    return rows


def load_universe(path: Path, limit: int, coin_ids: list[str] | None) -> list[dict[str, str]]:
    rows = list(csv.DictReader(path.open("r", encoding="utf-8", newline="")))
    if coin_ids:
        wanted = {coin.strip() for coin in coin_ids if coin.strip()}
        rows = [row for row in rows if (row.get("coingecko_id") or "").strip() in wanted]
    else:
        rows.sort(key=lambda row: int(float(row.get("rank_idx") or 999999)))
        rows = rows[:limit]
    out = []
    for row in rows:
        coin_id = (row.get("coingecko_id") or "").strip()
        if not coin_id:
            continue
        out.append(
            {
                "coingecko_id": coin_id,
                "symbol": (row.get("symbol") or "").strip(),
                "name": (row.get("name") or "").strip(),
                "bucket": (row.get("predicted_bucket") or "").strip(),
            }
        )
    return out


def classify_event(title: str, snippet: str) -> tuple[str, str, int]:
    text = f"{title} {snippet}".lower()
    scores: Counter[str] = Counter()
    for factor, keywords in FACTOR_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                scores[factor] += 1
    factor = scores.most_common(1)[0][0] if scores else "general_market"
    pos = sum(1 for word in POSITIVE_WORDS if word in text)
    neg = sum(1 for word in NEGATIVE_WORDS if word in text)
    if pos > neg:
        direction = "positive"
    elif neg > pos:
        direction = "negative"
    else:
        direction = "mixed_or_unclear"
    return factor, direction, int(scores[factor]) if scores else 0


def load_price_panel(path: Path) -> pd.DataFrame:
    px = pd.read_csv(path)
    px["date"] = pd.to_datetime(px["date"], errors="coerce")
    px = px.dropna(subset=["date"]).set_index("date").sort_index()
    return px.apply(pd.to_numeric, errors="coerce").ffill()


def _nearest_index(index: pd.DatetimeIndex, dt: pd.Timestamp) -> int | None:
    pos = index.searchsorted(dt.normalize(), side="left")
    if pos >= len(index):
        return None
    return int(pos)


def _read_existing_event_keys(out_dir: Path) -> tuple[set[str], set[str]]:
    csv_path = out_dir / "news_events.csv"
    json_path = out_dir / "articles_raw.jsonl"
    event_ids: set[str] = set()
    urls: set[str] = set()
    if csv_path.exists():
        try:
            existing = pd.read_csv(csv_path)
            if "event_id" in existing.columns:
                event_ids.update(existing["event_id"].dropna().astype(str))
            if "url" in existing.columns:
                for raw in existing["url"].dropna():
                    urls.add(_normalize_url(str(raw)))
        except Exception:
            pass
    if json_path.exists():
        for line in json_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            event_id = str(obj.get("event_id", "")).strip()
            if event_id:
                event_ids.add(event_id)
            raw_url = str(obj.get("url", ""))
            if raw_url:
                urls.add(_normalize_url(raw_url))
    return event_ids, urls


def attach_price_reactions(events: list[dict[str, Any]], price_panel: pd.DataFrame) -> None:
    horizons = [1, 3, 7, 14, 30]
    for event in events:
        coin_id = str(event["coingecko_id"])
        if coin_id not in price_panel.columns or not event.get("published_at"):
            continue
        dt = pd.to_datetime(event["published_at"], errors="coerce", utc=True)
        if pd.isna(dt):
            continue
        series = price_panel[coin_id].dropna()
        if series.empty:
            continue
        idx = _nearest_index(series.index, dt.tz_convert(None))
        if idx is None:
            continue
        p0 = float(series.iloc[idx])
        if p0 <= 0:
            continue
        event["event_price_date"] = str(series.index[idx].date())
        event["event_price_usd"] = p0
        for horizon in horizons:
            j = idx + horizon
            if j < len(series):
                event[f"fwd_{horizon}d_ret"] = float(series.iloc[j] / p0 - 1.0)


def write_outputs(
    events: list[dict[str, Any]],
    out_dir: Path,
    report_path: Path,
    append_existing: bool = False,
    overwrite_empty: bool = False,
) -> tuple[int, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    raw_path = out_dir / "articles_raw.jsonl"
    news_path = out_dir / "news_events.csv"
    existing_count = 0
    existing_df = pd.DataFrame()
    if append_existing:
        if news_path.exists():
            try:
                existing_df = pd.read_csv(news_path)
                existing_count = len(existing_df)
            except Exception:
                existing_df = pd.DataFrame()
    should_write_raw = bool(events) or overwrite_empty
    if should_write_raw:
        mode = "a" if append_existing and raw_path.exists() else "w"
        with raw_path.open(mode, encoding="utf-8") as fh:
            for event in events:
                fh.write(json.dumps(event, sort_keys=True) + "\n")

    df = pd.DataFrame(events)
    if append_existing and not existing_df.empty:
        df = pd.concat([existing_df, df], ignore_index=True)
        df = df.drop_duplicates(subset=["event_id"], keep="first")

    if df.empty:
        if not (overwrite_empty or append_existing):
            if news_path.exists():
                # Preserve existing historical corpus when a dry network period returns nothing.
                try:
                    preserved = pd.read_csv(news_path)
                    return len(preserved), len(preserved)
                except Exception:
                    pass
        df.to_csv(news_path, index=False)
        if not append_existing and overwrite_empty is False:
            # No events this cycle; keep report terse but stable.
            report_path.write_text("# Crypto News Context Panel\n\nNo events collected.\n", encoding="utf-8")
            return existing_count, 0
        report_path.write_text(
            "# Crypto News Context Panel\n\nNo events collected.\n",
            encoding="utf-8",
        )
        return existing_count, 0

    df = df.sort_values(["published_at", "coingecko_id", "title"], ascending=[False, True, True])
    df.to_csv(out_dir / "news_events.csv", index=False)

    daily = (
        df.assign(date=pd.to_datetime(df["published_at"], errors="coerce", utc=True).dt.date.astype(str))
        .groupby(["date", "coingecko_id", "factor", "direction"], dropna=False)
        .size()
        .reset_index(name="event_count")
        .sort_values(["date", "event_count"], ascending=[False, False])
    )
    daily.to_csv(out_dir / "factor_daily_panel.csv", index=False)

    factor_counts = df["factor"].value_counts().head(12)
    direction_counts = df["direction"].value_counts()
    top_events = df.head(20)
    lines = [
        "# Crypto News Context Panel",
        "",
        f"Generated: {datetime.now(timezone.utc).replace(microsecond=0).isoformat()}",
        "",
        f"Events collected in this run: `{len(df) - existing_count}`",
        f"Total cumulative events: `{len(df)}`",
        f"Coins covered: `{df['coingecko_id'].nunique()}`",
        "",
        "## Factor Mix",
        "",
    ]
    for factor, count in factor_counts.items():
        lines.append(f"- `{factor}`: {int(count)}")
    lines.extend(["", "## Direction Mix", ""])
    for direction, count in direction_counts.items():
        lines.append(f"- `{direction}`: {int(count)}")
    lines.extend(["", "## Latest Events", ""])
    lines.append("| Date | Coin | Factor | Direction | Title | Source |")
    lines.append("|---|---|---|---|---|---|")
    for _, row in top_events.iterrows():
        date = str(row.get("published_at", ""))[:10]
        title = str(row.get("title", "")).replace("|", "/")[:120]
        source = str(row.get("source", "")).replace("|", "/")[:60]
        lines.append(
            f"| {date} | {row.get('coingecko_id', '')} | {row.get('factor', '')} | "
            f"{row.get('direction', '')} | {title} | {source} |"
        )
    lines.extend(
        [
            "",
            "## Files",
            "",
            f"- `{out_dir / 'news_events.csv'}`",
            f"- `{out_dir / 'factor_daily_panel.csv'}`",
            f"- `{out_dir / 'articles_raw.jsonl'}`",
            "",
            "Use `news_events.csv` for event studies. It contains article metadata, factor tags, direction tags, and forward returns where the local price panel has enough future observations.",
        ]
    )
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return existing_count, len(df)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compile crypto news/event metadata and price reactions.")
    parser.add_argument("--universe", type=Path, default=DEFAULT_UNIVERSE)
    parser.add_argument("--price-panel", type=Path, default=DEFAULT_PRICE_PANEL)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--limit-coins", type=int, default=20)
    parser.add_argument("--coin-id", action="append", default=None, help="Specific CoinGecko id to collect; repeatable.")
    parser.add_argument("--days", type=int, default=45)
    parser.add_argument("--max-articles-per-coin", type=int, default=12)
    parser.add_argument("--sleep", type=float, default=0.5)
    parser.add_argument(
        "--query-depth",
        choices=sorted(QUERY_TEMPLATE_LEVELS.keys()),
        default="standard",
        help="Query templates: light, standard, or deep.",
    )
    parser.add_argument(
        "--sources",
        type=str,
        default="google,feed,yf",
        help="Comma-separated sources: google,feed,yf",
    )
    parser.add_argument("--append-existing", action="store_true", help="Append to existing output files.")
    parser.add_argument(
        "--min-factor-score",
        type=int,
        default=0,
        help="Drop events below this factor keyword score.",
    )
    parser.add_argument(
        "--max-total-events",
        type=int,
        default=0,
        help="Stop after this many newly collected events (0 means unlimited).",
    )
    parser.add_argument(
        "--overwrite-empty",
        action="store_true",
        help="Overwrite news_outputs even when no new events are found.",
    )
    args = parser.parse_args()

    coins = load_universe(args.universe, int(args.limit_coins), args.coin_id)
    seen: set[str] = set()
    existing_event_ids: set[str] = set()
    existing_urls: set[str] = set()
    if args.append_existing:
        existing_event_ids, existing_urls = _read_existing_event_keys(args.out_dir)
    selected_sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}
    if not selected_sources:
        selected_sources = {"google", "feed", "yf"}
    events: list[dict[str, Any]] = []
    for coin in coins:
        for query in build_query_plan(coin, args.query_depth):
            source_queries = []
            if "google" in selected_sources:
                source_queries.append(("google", query))
            if "feed" in selected_sources:
                source_queries.extend(("feed", f"{name}:{query}") for name in FALLBACK_RSS_FEEDS)
            if "yf" in selected_sources:
                source_queries.append(("yfinance", query))
            for source_type, q in source_queries:
                if args.max_total_events > 0 and len(events) >= args.max_total_events:
                    break
                try:
                    if source_type == "google":
                        articles = fetch_google_news(q, int(args.days), int(args.max_articles_per_coin), float(args.sleep))
                    elif source_type == "feed":
                        feed_name = q.split(":", 1)[0]
                        feed_url = FALLBACK_RSS_FEEDS.get(feed_name)
                        if not feed_url:
                            continue
                        articles = fetch_feed_news(feed_name, feed_url, int(args.days), int(args.max_articles_per_coin))
                    else:
                        articles = fetch_yfinance_news(coin, int(args.days), int(args.max_articles_per_coin))
                except Exception as exc:
                    print(f"warn: failed {source_type} query for {coin['coingecko_id']}: {exc}")
                    continue
                for article in articles:
                    if args.max_total_events > 0 and len(events) >= args.max_total_events:
                        break
                    if not relevant_article(article, coin):
                        continue
                    event = _make_deduped_event(
                        article,
                        coin,
                        seen,
                        existing_event_ids,
                        existing_urls,
                        args.min_factor_score,
                        args.query_depth,
                    )
                    if event is None:
                        continue
                    if "query" not in event:
                        event["query"] = q
                    seen.add(event["event_id"])
                    events.append(event)
            if args.max_total_events > 0 and len(events) >= args.max_total_events:
                break
        if args.max_total_events > 0 and len(events) >= args.max_total_events:
            break

    if events:
        attach_price_reactions(events, load_price_panel(args.price_panel))
    existing_count, cumulative_count = write_outputs(
        events,
        args.out_dir,
        args.report,
        append_existing=args.append_existing,
        overwrite_empty=bool(args.overwrite_empty),
    )
    print(f"previous_events={existing_count}, this_run={len(events)}, cumulative={cumulative_count}")
    print(f"wrote {args.out_dir / 'news_events.csv'}")
    print(f"wrote {args.out_dir / 'factor_daily_panel.csv'}")
    print(f"wrote {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
