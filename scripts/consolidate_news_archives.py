#!/usr/bin/env python3
"""Consolidate raw news archives into a canonical research dataset.

Raw archives stay untouched. This script creates derived files with a stable
schema that downstream event studies and factor builders can consume.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

import pandas as pd


DEFAULT_RAW_DIR = Path("data_lake/crypto_pipeline/news_context/raw_archives")
DEFAULT_OUT_DIR = Path("data_lake/crypto_pipeline/news_context/research_dataset")
DEFAULT_REPORT = Path("reports/CRYPTO_NEWS_RESEARCH_DATASET.md")

CRYPTO_TERMS = {
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "crypto",
    "cryptocurrency",
    "blockchain",
    "defi",
    "web3",
    "token",
    "stablecoin",
    "nft",
    "altcoin",
    "altcoins",
    "altseason",
    "solana",
    "binance",
    "coinbase",
    "coindesk",
    "cointelegraph",
    "cryptonews",
    "cryptopanic",
    "decrypt",
}

KNOWN_CRYPTO_HF_DATASETS = {
    "aaurelions__cryptocurrency-tweets-sentiment",
    "danilocorsi__LLMs-Sentiment-Augmented-Bitcoin-Dataset",
    "ExponentialScience__DLT-Sentiment-News",
    "Gopher-Lab__Crypto_AltSeason_Sentiment_X_Twitter",
    "modestus__bitcoin_sentiment_analysis",
    "StephanAkkerman__financial-tweets-crypto",
    "xesutr__crypto_news_augmented_dataset",
}
CRYPTO_DOMAINS = {
    "coindesk.com",
    "cointelegraph.com",
    "cryptonews.com",
    "cryptopanic.com",
    "decrypt.co",
    "dailyhodl.com",
    "cryptopotato.com",
    "news.bitcoin.com",
    "bitcoin.com",
}

CANONICAL_COLUMNS = [
    "record_id",
    "source_archive",
    "source_dataset",
    "source_file",
    "record_type",
    "published_at",
    "date",
    "publisher",
    "title",
    "text",
    "url",
    "asset_hint",
    "tags",
    "categories",
    "sentiment_label",
    "sentiment_score",
    "impact_score",
    "impact_status",
    "impact_timeframe",
    "expected_change_pct",
    "market_move",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "movement_openclose_pct",
    "movement_highlow_pct",
    "quality_flags",
]

SENTIMENT_NUMERIC_MAPS = {
    "aaurelions__cryptocurrency-tweets-sentiment": {
        "0": "negative",
        "1": "positive",
        "2": "neutral",
    },
    "ExponentialScience__DLT-Sentiment-News": {
        "0": "neutral",
        "1": "negative",
        "2": "positive",
    },
}

SKIP_HF_CSV_NAMES = {
    "coindesk-crypto-news-2020-2025.csv",
    "news_impact_deepseek.csv",
    "news_impact_llama.csv",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _read_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    return str(value).strip()


def _safe_num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _first_matching_group(value: Any, patterns: list[str], default: str = "") -> str:
    text = _safe_text(value)
    if not text:
        return default
    for pat in patterns:
        m = re.match(pat, text, flags=re.IGNORECASE)
        if m and m.group(1):
            return m.group(1).strip()
    return default


def _normalize_sentiment_label(
    label: Any,
    score: float | None,
    numeric_map: dict[str, str] | None = None,
) -> str:
    text = _safe_text(label).lower()
    if numeric_map and text in numeric_map:
        return numeric_map[text]
    numeric_text = _safe_num(text)
    if numeric_text is not None and score is not None and abs(score) <= 1:
        if score > 0:
            return "positive"
        if score < 0:
            return "negative"
        return "neutral"
    if not text and score is not None:
        if score > 0:
            return "positive"
        if score < 0:
            return "negative"
        return "neutral"

    if text in {"-1", "0", "1"}:
        # Signed score convention. Dataset-specific class-label schemes are
        # handled by numeric_map before this fallback.
        numeric = float(text)
        if numeric > 0:
            return "positive"
        if numeric < 0:
            return "negative"
        return "neutral"

    if "positive" in text or "bull" in text or "up" in text:
        return "positive"
    if "negative" in text or "bear" in text or "down" in text or "fall" in text:
        return "negative"
    if "neutral" in text or "mixed" in text or "unclear" in text:
        return "neutral"
    return text


def _parse_dt(value: Any) -> str:
    text = _safe_text(value)
    if not text:
        return ""
    dt = pd.to_datetime(text, errors="coerce", utc=True)
    if pd.isna(dt):
        return ""
    return dt.isoformat()


def _date_from_iso(value: str) -> str:
    if not value:
        return ""
    return value[:10]


def _domain(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def _looks_crypto(row: dict[str, Any]) -> bool:
    joined = " ".join(
        _safe_text(row.get(k)).lower()
        for k in ("title", "text", "url", "asset_hint", "tags", "categories", "publisher")
    )
    if any(term in joined for term in CRYPTO_TERMS):
        return True
    domain = _domain(_safe_text(row.get("url")))
    return any(domain == d or domain.endswith("." + d) for d in CRYPTO_DOMAINS)


def _record_id(row: dict[str, Any]) -> str:
    text = _safe_text(row.get("text")).lower()
    text_digest = hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest() if text else ""
    key = "|".join(
        [
            _safe_text(row.get("source_dataset")).lower(),
            _safe_text(row.get("source_file")).lower(),
            _safe_text(row.get("record_type")).lower(),
            _safe_text(row.get("url")).lower(),
            _safe_text(row.get("published_at")).lower(),
            _safe_text(row.get("asset_hint")).lower(),
            _safe_text(row.get("title")).lower(),
            _safe_text(row.get("sentiment_label")).lower(),
            _safe_text(row.get("market_move")).lower(),
            text_digest,
        ]
    )
    return hashlib.sha1(key.encode("utf-8", errors="ignore")).hexdigest()


def _emit(row: dict[str, Any]) -> dict[str, Any]:
    clean = {col: row.get(col, "") for col in CANONICAL_COLUMNS}
    clean["published_at"] = _parse_dt(clean.get("published_at"))
    clean["date"] = clean.get("date") or _date_from_iso(clean["published_at"])
    clean["record_id"] = clean.get("record_id") or _record_id(clean)
    return clean


def _source_dataset(path: Path, raw_dir: Path) -> str:
    rel = path.relative_to(raw_dir)
    if len(rel.parts) >= 3 and rel.parts[0] == "huggingface":
        return rel.parts[1]
    if len(rel.parts) >= 2:
        return "/".join(rel.parts[:2])
    return rel.parts[0]


def _known_crypto_hf_source(path: Path) -> bool:
    text = str(path)
    return any(dataset in text for dataset in KNOWN_CRYPTO_HF_DATASETS)


def _append_rows(
    rows: list[dict[str, Any]],
    stats: Counter,
    source_file: Path,
    raw_dir: Path,
    source_archive: str,
    mapped: Iterable[dict[str, Any]],
    crypto_filter: bool,
) -> None:
    source_dataset = _source_dataset(source_file, raw_dir)
    total = 0
    kept = 0
    for row in mapped:
        total += 1
        row["source_archive"] = source_archive
        row["source_dataset"] = row.get("source_dataset") or source_dataset
        row["source_file"] = str(source_file)
        row["quality_flags"] = row.get("quality_flags") or ""
        if crypto_filter and not _looks_crypto(row):
            continue
        rows.append(_emit(row))
        kept += 1
    stats[f"rows_seen::{source_dataset}"] += total
    stats[f"rows_kept::{source_dataset}"] += kept


def _raise_csv_field_limit() -> None:
    limit = sys.maxsize
    while True:
        try:
            csv.field_size_limit(limit)
            return
        except OverflowError:
            limit = int(limit / 10)


def _iter_csv_chunks(path: Path, chunksize: int = 50000) -> Iterable[pd.DataFrame]:
    _raise_csv_field_limit()
    try:
        yield from pd.read_csv(path, chunksize=chunksize, low_memory=False, on_bad_lines="skip")
    except Exception as exc:
        print(f"[warn] C-engine csv parse failed for {path}: {exc}; retrying with python engine", file=sys.stderr)
        try:
            yield from pd.read_csv(
                path,
                chunksize=chunksize,
                low_memory=False,
                engine="python",
                on_bad_lines="skip",
            )
        except Exception as retry_exc:
            print(f"[warn] could not parse csv {path}: {retry_exc}", file=sys.stderr)


def _extract_tickers_from_financial_info(value: Any) -> str:
    if not value:
        return ""
    text = _safe_text(value)
    matches = [m for m in re.findall(r"\$[A-Za-z0-9]{2,10}", text) if re.search(r"[A-Za-z]", m)]
    if not matches:
        return ""
    return " ".join(m.strip("$").upper() for m in matches[:5])


def _coerce_modestus_metrics(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    if isinstance(value, str):
        try:
            import json

            value = json.loads(value)
        except Exception:
            return ""
    if hasattr(value, "tolist"):
        value = value.tolist()
    if not isinstance(value, (list, tuple)):
        return ""
    parts = []
    for rec in value:
        if isinstance(rec, dict):
            policy = rec.get("policy")
            reasoning = rec.get("reasoning")
            if policy:
                parts.append(policy)
            if reasoning:
                parts.append(reasoning)
    return " | ".join(parts)


def _coerce_date_alias(value: Any) -> Any:
    text = _safe_text(value)
    if not text:
        return value
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        return text
    if re.match(r"^\d{13}$", text):
        try:
            return pd.to_datetime(int(text), unit="ms", utc=True).isoformat()
        except Exception:
            return value
    return value


def _coindesk_rows(path: Path) -> Iterable[dict[str, Any]]:
    for chunk in _iter_csv_chunks(path):
        for r in chunk.to_dict("records"):
            yield {
                "record_type": "article",
                "published_at": r.get("published_on"),
                "publisher": r.get("source"),
                "title": r.get("title"),
                "text": r.get("body"),
                "url": r.get("url") or r.get("guid"),
                "tags": r.get("tags"),
                "categories": r.get("categories"),
            }


def _impact_rows(path: Path, model_name: str) -> Iterable[dict[str, Any]]:
    for chunk in _iter_csv_chunks(path):
        for r in chunk.to_dict("records"):
            yield {
                "record_type": f"impact_label_{model_name}",
                "published_at": r.get("published_on"),
                "title": r.get("title"),
                "url": r.get("url"),
                "impact_score": _safe_num(r.get("impact_score")),
                "impact_status": r.get("impact_status"),
                "impact_timeframe": r.get("impact_timeframe"),
                "expected_change_pct": _safe_num(r.get("expected_change_pct")),
                "text": r.get("reason"),
            }


def _mendeley_rows(path: Path) -> Iterable[dict[str, Any]]:
    for chunk in _iter_csv_chunks(path):
        for r in chunk.to_dict("records"):
            yield {
                "record_type": "article_with_market_reaction",
                "published_at": r.get("Date Time"),
                "publisher": _domain(_safe_text(r.get("URL"))),
                "title": r.get("Title"),
                "text": r.get("Full Text") or r.get("Description"),
                "url": r.get("URL"),
                "asset_hint": r.get("Coin Type"),
                "sentiment_label": r.get("sentiment_label"),
                "sentiment_score": _safe_num(r.get("sentiment_score")),
                "open": _safe_num(r.get("Open")),
                "high": _safe_num(r.get("High")),
                "low": _safe_num(r.get("Low")),
                "close": _safe_num(r.get("Close")),
                "volume": _safe_num(r.get("Volume")),
                "movement_openclose_pct": _safe_num(r.get("Movement_OpenClose_%")),
                "movement_highlow_pct": _safe_num(r.get("Movement_HighLow_%")),
                "market_move": r.get("Market_Move"),
            }


def _figshare_rows(path: Path) -> Iterable[dict[str, Any]]:
    for chunk in _iter_csv_chunks(path):
        for r in chunk.to_dict("records"):
            sentiment = _safe_text(r.get("sentiment"))
            label = ""
            score = None
            if sentiment:
                if "positive" in sentiment:
                    label = "positive"
                elif "negative" in sentiment:
                    label = "negative"
                elif "neutral" in sentiment:
                    label = "neutral"
                m = re.search(r"polarity['\"]?:\s*([-0-9.]+)", sentiment)
                if m:
                    score = _safe_num(m.group(1))
            yield {
                "record_type": "article",
                "published_at": r.get("date"),
                "publisher": r.get("source"),
                "title": r.get("title"),
                "text": r.get("text"),
                "url": r.get("url"),
                "categories": r.get("subject"),
                "sentiment_label": label,
                "sentiment_score": score,
            }


def _gopher_lab_rows(path: Path) -> Iterable[dict[str, Any]]:
    """Parse the Gopher-Lab export, which contains malformed multi-line quoted rows."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    starts = [m.start() for m in re.finditer(r'(?m)^\"?\d{15,},', text)]
    if not starts:
        return
    starts.append(len(text))

    pattern = re.compile(
        r'^\"?(?P<tweet_id>\d+),(?:\"{1,2})(?P<content>.*?)(?:\"{1,2}),'
        r'(?P<username>[^,]+),(?P<created_at>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z),'
        r'(?P<likes>\d+),(?P<bookmark>\d+),(?P<impression>\d+),'
        r'(?P<like_count>\d+),(?P<quote_count>\d+),(?P<reply_count>\d+),'
        r'(?P<retweet_count>\d+),(?P<tweet_ref_id>\d+),(?P<user_id>\d+),'
        r'(?P<conversation_id>\d+),(?P<score>\d+)\"?$',
        re.S,
    )
    fallback = re.compile(
        r'^\"?(?P<tweet_id>\d+),(?P<content>.*?),(?P<username>[^,]+),'
        r'(?P<created_at>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z),'
        r'(?P<likes>\d+),(?P<bookmark>\d+),(?P<impression>\d+),'
        r'(?P<like_count>\d+),(?P<quote_count>\d+),(?P<reply_count>\d+),'
        r'(?P<retweet_count>\d+),(?P<tweet_ref_id>\d+),(?P<user_id>\d+),'
        r'(?P<conversation_id>\d+),(?P<score>\d+)\"?$',
        re.S,
    )
    line_count = 0

    for idx in range(len(starts) - 1):
        chunk = text[starts[idx] : starts[idx + 1]].strip()
        if not chunk:
            continue
        match = pattern.match(chunk) or fallback.match(chunk.replace("\\n", " "))
        if not match:
            line_count += 1
            continue
        info = match.groupdict()
        content = _safe_text(info["content"])
        content = re.sub(r'\\"', '"', content)
        content = content.strip()
        if content.startswith('""') and content.endswith('""'):
            content = content[2:-2]
        elif content.startswith('"') and content.endswith('"'):
            content = content[1:-1]
        content = content.replace('\n', ' ').replace('""', '"')
        yield {
            "record_type": "twitter_timeline",
            "published_at": info["created_at"],
            "publisher": info["username"],
            "title": "",
            "text": content,
            "url": "",
            "source_family": "gopher_lab_altseason",
            "asset_hint": _extract_tickers_from_financial_info(content),
            "sentiment_score": _safe_num(info["score"]),
            "sentiment_label": "positive" if info["score"] != "0" else "neutral",
            "source_dataset": "Gopher-Lab__Crypto_AltSeason_Sentiment_X_Twitter",
        }


def _numeric_sentiment_map_for_path(path: Path) -> dict[str, str] | None:
    text = str(path)
    for key, mapping in SENTIMENT_NUMERIC_MAPS.items():
        if key in text:
            return mapping
    return None


def _record_type_for_path(path: Path) -> str:
    text = str(path)
    name = path.name.lower()
    if "Instrumetriq__" in text or "sovai__news_sentiment" in text:
        return "market_sentiment_observation"
    if "danilocorsi__LLMs-Sentiment-Augmented-Bitcoin-Dataset" in text:
        return "daily_bitcoin_context"
    if "StephanAkkerman__financial-tweets-crypto" in text or "Gopher-Lab__Crypto_AltSeason_Sentiment_X_Twitter" in text:
        return "twitter_timeline"
    if "tweets" in text.lower() or "twitter" in text.lower() or name in {"crypto.csv"}:
        return "social_post"
    return "article_or_sentiment"


def _default_asset_hint(path: Path, row: dict[str, Any]) -> str:
    text = str(path).lower()
    if "bitcoin" in text:
        return "BTC"
    if "crypto" in text or "dlt-sentiment" in text:
        return _extract_tickers_from_financial_info(_safe_text(row.get("financial_info")))
    return ""


def _generic_frame_rows(path: Path, df: pd.DataFrame, record_type: str) -> Iterable[dict[str, Any]]:
    cols = {c.lower(): c for c in df.columns}
    numeric_label_map = _numeric_sentiment_map_for_path(path)

    def pick(r: dict[str, Any], names: list[str]) -> Any:
        for name in names:
            col = cols.get(name.lower())
            if col is not None:
                return r.get(col)
        return ""

    for r in df.to_dict("records"):
        score = _safe_num(
            pick(
                r,
                [
                    "sentiment_score",
                    "sentiment_mean_score",
                    "sentiment",
                    "score",
                    "polarity",
                    "fng_value",
                    "cbbi_value",
                    "pct_price_change",
                ],
            )
        )
        label_raw = pick(
            r,
            [
                "sentiment_label",
                "sentiment_class",
                "label",
                "market_direction",
                "sentiment",
                "fng_sentiment",
                "cbbi_sentiment",
                "trend",
                "action_class",
            ],
        )
        mapped = {
            "record_type": record_type,
            "published_at": _coerce_date_alias(
                pick(
                    r,
                    [
                        "date",
                        "published_on",
                        "published_at",
                        "created_at",
                        "created",
                        "created_time",
                        "timestamp",
                        "snapshot_ts",
                    ],
                )
            ),
            "publisher": pick(r, ["source", "publisher", "site", "domain", "author", "source_name"]),
            "title": pick(r, ["title", "headline", "name", "subject"]),
            "text": pick(
                r,
                [
                    "text",
                    "body",
                    "content",
                    "description",
                    "news",
                    "sentence",
                    "summary",
                    "reason",
                    "reasoning_text",
                    "tweet",
                    "reasoning",
                    "article",
                    "post",
                    "embed_title",
                ],
            ),
            "url": pick(r, ["url", "link", "source_url", "link_url", "tweet_url", "post_url", "guid"]),
            "asset_hint": pick(
                r,
                [
                    "symbol",
                    "coin",
                    "coin_type",
                    "asset",
                    "ticker",
                    "coin_name",
                    "token",
                    "asset_name",
                    "crypto",
                ],
            ),
            "tags": pick(r, ["labels", "topics", "sector", "tags"]),
            "categories": pick(r, ["category", "categories", "topic", "news_type", "classification"]),
            "sentiment_label": _normalize_sentiment_label(label_raw, score, numeric_label_map),
            "sentiment_score": score,
            "impact_score": _safe_num(pick(r, ["impact_score", "action_score", "score_final", "fng_value", "cbbi_value"])),
            "market_move": pick(r, ["market_move", "pct_change", "trend", "sentiment_class"]),
            "impact_status": pick(r, ["impact_status", "action_class"]),
            "impact_timeframe": pick(r, ["impact_timeframe"]),
            "expected_change_pct": _safe_num(pick(r, ["expected_change_pct", "pct_price_change", "percent_change"])),
            "open": _safe_num(pick(r, ["open"])),
            "high": _safe_num(pick(r, ["high"])),
            "low": _safe_num(pick(r, ["low"])),
            "close": _safe_num(pick(r, ["close", "spot_mid"])),
            "volume": _safe_num(pick(r, ["volume"])),
        }
        mapped = {
            **mapped,
            "asset_hint": (
                mapped["asset_hint"]
                or _extract_tickers_from_financial_info(pick(r, ["financial_info"]))
                or _extract_tickers_from_financial_info(_safe_text(mapped.get("text")))
                or _default_asset_hint(path, r)
            ),
            "tags": mapped["tags"] or _extract_tickers_from_financial_info(pick(r, ["financial_info"])),
        }
        has_research_text = any(_safe_text(mapped.get(k)) for k in ("title", "text", "url"))
        has_structured_signal = any(
            _safe_text(mapped.get(k))
            for k in ("asset_hint", "sentiment_label", "sentiment_score", "impact_score", "market_move")
        )
        if record_type not in {"market_sentiment_observation", "daily_bitcoin_context"} and not has_research_text:
            continue
        if not has_research_text and not has_structured_signal:
            continue
        yield mapped


def _parquet_rows(path: Path) -> Iterable[dict[str, Any]]:
    df = pd.read_parquet(path)
    yield from _generic_frame_rows(path, df, _record_type_for_path(path))


def _jsonl_rows(path: Path) -> Iterable[dict[str, Any]]:
    df = pd.read_json(path, lines=True)
    yield from _generic_frame_rows(path, df, "macro_news_context")


def _csv_rows(path: Path) -> Iterable[dict[str, Any]]:
    if "Gopher-Lab__Crypto_AltSeason_Sentiment_X_Twitter" in str(path):
        yield from _gopher_lab_rows(path)
        return
    record_type = _record_type_for_path(path)
    for chunk in _iter_csv_chunks(path):
        yield from _generic_frame_rows(path, chunk, record_type)


def _kaggle_zip_rows(path: Path) -> Iterable[dict[str, Any]]:
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            lower = name.lower()
            if not lower.endswith((".csv", ".jsonl")):
                continue
            with zf.open(name) as fh:
                try:
                    if lower.endswith(".csv"):
                        df = pd.read_csv(fh)
                    else:
                        df = pd.read_json(fh, lines=True)
                except Exception:
                    continue
            for row in _generic_frame_rows(path, df, "article_or_sentiment"):
                row["source_dataset"] = f"kaggle/{path.stem}:{name}"
                yield row


GDELT_MENTION_COLUMNS = [
    "global_event_id",
    "event_time",
    "mention_time",
    "mention_type",
    "mention_source_name",
    "mention_identifier",
    "sentence_id",
    "actor1_char_offset",
    "actor2_char_offset",
    "action_char_offset",
    "in_raw_text",
    "confidence",
    "mention_doc_len",
    "mention_doc_tone",
    "mention_doc_translation_info",
    "extras",
]


def _gdelt_mention_rows(path: Path) -> Iterable[dict[str, Any]]:
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        if not names:
            return
        with zf.open(names[0]) as fh:
            reader = csv.reader((line.decode("utf-8", "ignore") for line in fh), delimiter="\t")
            for r in reader:
                if len(r) < 6:
                    continue
                data = dict(zip(GDELT_MENTION_COLUMNS, r))
                yield {
                    "record_type": "gdelt_mention",
                    "published_at": data.get("mention_time"),
                    "publisher": data.get("mention_source_name"),
                    "url": data.get("mention_identifier"),
                    "sentiment_score": _safe_num(data.get("mention_doc_tone")),
                    "impact_score": _safe_num(data.get("confidence")),
                    "quality_flags": "gdelt_url_only",
                }


def _write_parquet_from_csv(csv_path: Path, parquet_path: Path) -> bool:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except Exception:
        return False

    writer: pq.ParquetWriter | None = None
    try:
        for chunk in pd.read_csv(csv_path, chunksize=50000, low_memory=False):
            table = pa.Table.from_pandas(chunk, preserve_index=False)
            if writer is None:
                writer = pq.ParquetWriter(parquet_path, table.schema)
            writer.write_table(table)
    finally:
        if writer is not None:
            writer.close()
    return True


def build_dataset(
    raw_dir: Path,
    out_dir: Path,
    include_gdelt: bool,
    crypto_filter: bool,
    include_market_observations: bool,
    write_parquet: bool,
) -> dict[str, Any]:
    stats: Counter = Counter()
    seen_ids: set[str] = set()
    source_counts: Counter = Counter()
    source_datasets: set[str] = set()
    daily_records: Counter = Counter()
    daily_urls: dict[tuple[str, str], set[str]] = defaultdict(set)
    daily_sentiment_records: Counter = Counter()
    daily_sentiment_sum: defaultdict[tuple[str, str], float] = defaultdict(float)
    daily_sentiment_n: Counter = Counter()
    daily_impact_sum: defaultdict[tuple[str, str], float] = defaultdict(float)
    daily_impact_n: Counter = Counter()
    rows_before_dedupe = 0
    rows_after_dedupe = 0
    date_min = ""
    date_max = ""

    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "canonical_news_events.csv"

    def add(
        writer: csv.DictWriter,
        path: Path,
        source_archive: str,
        mapped: Iterable[dict[str, Any]],
        filter_rows: bool = True,
    ) -> None:
        nonlocal rows_before_dedupe, rows_after_dedupe, date_min, date_max
        source_dataset = _source_dataset(path, raw_dir)
        total = 0
        kept = 0
        for row in mapped:
            total += 1
            row["source_archive"] = source_archive
            row["source_dataset"] = row.get("source_dataset") or source_dataset
            row["source_file"] = str(path)
            row["quality_flags"] = row.get("quality_flags") or ""
            if crypto_filter and filter_rows and not _looks_crypto(row):
                continue

            clean = _emit(row)
            rows_before_dedupe += 1
            if clean["record_id"] in seen_ids:
                continue
            seen_ids.add(clean["record_id"])
            writer.writerow(clean)
            kept += 1
            rows_after_dedupe += 1

            date = clean.get("date") or ""
            if date:
                date_min = date if not date_min else min(date_min, date)
                date_max = date if not date_max else max(date_max, date)
            archive = clean.get("source_archive") or ""
            dataset = clean.get("source_dataset") or ""
            source_counts[archive] += 1
            source_datasets.add(dataset)
            key = (date, archive)
            daily_records[key] += 1
            if clean.get("url"):
                daily_urls[key].add(clean["url"])
            if clean.get("sentiment_label"):
                daily_sentiment_records[key] += 1
            sent = _safe_num(clean.get("sentiment_score"))
            if sent is not None:
                daily_sentiment_sum[key] += sent
                daily_sentiment_n[key] += 1
            impact = _safe_num(clean.get("impact_score"))
            if impact is not None:
                daily_impact_sum[key] += impact
                daily_impact_n[key] += 1

        stats[f"rows_seen::{source_dataset}"] += total
        stats[f"rows_kept::{source_dataset}"] += kept

    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CANONICAL_COLUMNS)
        writer.writeheader()

        hf = raw_dir / "huggingface"
        if (hf / "coindesk-crypto-news-2020-2025.csv").exists():
            add(writer, hf / "coindesk-crypto-news-2020-2025.csv", "huggingface", _coindesk_rows(hf / "coindesk-crypto-news-2020-2025.csv"), False)
        if (hf / "news_impact_deepseek.csv").exists():
            add(writer, hf / "news_impact_deepseek.csv", "huggingface", _impact_rows(hf / "news_impact_deepseek.csv", "deepseek"), False)
        if (hf / "news_impact_llama.csv").exists():
            add(writer, hf / "news_impact_llama.csv", "huggingface", _impact_rows(hf / "news_impact_llama.csv", "llama"), False)

        mendeley = raw_dir / "mendeley" / "wvjjxr8bxx" / "CryptoDataSet.csv"
        if mendeley.exists():
            add(writer, mendeley, "mendeley", _mendeley_rows(mendeley), False)

        figshare = raw_dir / "figshare" / "21989735" / "cryptonews.csv"
        if figshare.exists():
            add(writer, figshare, "figshare", _figshare_rows(figshare), False)

        for path in sorted(hf.glob("**/*.parquet")):
            if "Instrumetriq__" in str(path) and not include_market_observations:
                continue
            if "sovai__news_sentiment" in str(path) and not include_market_observations:
                continue
            add(
                writer,
                path,
                "huggingface",
                _parquet_rows(path),
                "Instrumetriq__" not in str(path) and not _known_crypto_hf_source(path),
            )
        for path in sorted(hf.glob("**/*.csv")):
            if path.name in SKIP_HF_CSV_NAMES:
                continue
            if "Instrumetriq__" in str(path) and not include_market_observations:
                continue
            if path.with_suffix(".parquet").exists():
                continue
            add(
                writer,
                path,
                "huggingface",
                _csv_rows(path),
                "Instrumetriq__" not in str(path) and not _known_crypto_hf_source(path),
            )
        for path in sorted(hf.glob("**/*.jsonl")):
            add(writer, path, "huggingface", _jsonl_rows(path), True)
        for path in (raw_dir / "kaggle").glob("*.zip"):
            add(writer, path, "kaggle", _kaggle_zip_rows(path), True)

        if include_gdelt:
            for path in (raw_dir / "gdelt" / "window" / "mentions").glob("*.zip"):
                add(writer, path, "gdelt", _gdelt_mention_rows(path), True)

    coverage = pd.DataFrame(
        [
            {
                "source_dataset": key.split("::", 1)[1],
                "metric": key.split("::", 1)[0],
                "value": value,
            }
            for key, value in sorted(stats.items())
        ]
    )
    coverage.to_csv(out_dir / "source_coverage.csv", index=False)

    daily_rows = []
    for key in sorted(daily_records):
        date, archive = key
        daily_rows.append(
            {
                "date": date,
                "source_archive": archive,
                "records": daily_records[key],
                "unique_urls": len(daily_urls[key]),
                "sentiment_records": daily_sentiment_records[key],
                "avg_sentiment_score": daily_sentiment_sum[key] / daily_sentiment_n[key]
                if daily_sentiment_n[key]
                else "",
                "avg_impact_score": daily_impact_sum[key] / daily_impact_n[key] if daily_impact_n[key] else "",
            }
        )
    daily = pd.DataFrame(daily_rows)
    daily.to_csv(out_dir / "daily_source_panel.csv", index=False)
    parquet_written = False
    if write_parquet:
        parquet_written = _write_parquet_from_csv(csv_path, out_dir / "canonical_news_events.parquet")

    return {
        "rows_before_dedupe": rows_before_dedupe,
        "rows_after_dedupe": rows_after_dedupe,
        "date_min": date_min,
        "date_max": date_max,
        "sources": dict(source_counts),
        "datasets": len(source_datasets),
        "output_dir": str(out_dir),
        "parquet_written": parquet_written,
    }


def write_report(summary: dict[str, Any], report_path: Path) -> None:
    lines = [
        "# Crypto News Research Dataset",
        "",
        f"Generated: {_now_iso()}",
        "",
        "## Summary",
        "",
        f"- Rows before dedupe: {summary['rows_before_dedupe']}",
        f"- Rows after dedupe: {summary['rows_after_dedupe']}",
        f"- Date range: {summary['date_min']} to {summary['date_max']}",
        f"- Source families: {summary['sources']}",
        f"- Distinct source datasets: {summary['datasets']}",
        f"- Parquet written: {summary['parquet_written']}",
        "",
        "## Files",
        "",
        f"- `{summary['output_dir']}/canonical_news_events.csv`",
        f"- `{summary['output_dir']}/daily_source_panel.csv`",
        f"- `{summary['output_dir']}/source_coverage.csv`",
        "",
        "## Notes",
        "",
        "- Raw archives are unchanged.",
        "- GDELT mention rows are URL-level records and carry `quality_flags=gdelt_url_only`.",
        "- Generic non-crypto files are filtered by crypto terms/domains where possible.",
        "- Numeric market-observation datasets are excluded by default; rerun with `--include-market-observations` for those.",
    ]
    if summary.get("parquet_written"):
        lines.insert(lines.index("## Notes") - 1, f"- `{summary['output_dir']}/canonical_news_events.parquet`")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build canonical crypto news research dataset.")
    ap.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--no-gdelt", dest="include_gdelt", action="store_false")
    ap.add_argument("--no-crypto-filter", dest="crypto_filter", action="store_false")
    ap.add_argument("--include-market-observations", action="store_true")
    ap.add_argument("--write-parquet", action="store_true")
    ap.set_defaults(include_gdelt=True, crypto_filter=True)
    args = ap.parse_args()

    summary = build_dataset(
        args.raw_dir,
        args.out_dir,
        args.include_gdelt,
        args.crypto_filter,
        args.include_market_observations,
        args.write_parquet,
    )
    write_report(summary, args.report)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
