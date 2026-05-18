#!/usr/bin/env python3
"""Build news/social crypto event-study panels from local archives."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_NEWS = Path("data_lake/crypto_pipeline/news_context/research_dataset/canonical_news_events.csv")
DEFAULT_PRICE = Path("data_lake/crypto_pipeline/exports/price_panel_long.csv")
DEFAULT_PROFILES = Path("data_lake/crypto_pipeline/exports/coin_profiles_clean.csv")
DEFAULT_ANALYTICS = Path("data_lake/crypto_pipeline/exports/coin_analytics_clean.csv")
DEFAULT_REDDIT = Path("data_lake/sentiment/reddit_daily_signals.csv")
DEFAULT_REDDIT_RAW = [
    Path("data_lake/sentiment/reddit_recent.jsonl"),
    Path("data_lake/reddit_recent.jsonl"),
    Path("data_lake/reddit_recent_more.jsonl"),
]
DEFAULT_OUT_DIR = Path("data_lake/crypto_pipeline/news_context/event_research")
DEFAULT_REPORT = Path("reports/CRYPTO_NEWS_SOCIAL_EVENT_STUDY.md")

HORIZONS = [1, 3, 7, 14, 30]
MAJOR_SYMBOLS = {
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
    "ADA",
    "DOGE",
    "TRX",
    "AVAX",
    "LINK",
    "DOT",
    "LTC",
    "BCH",
    "TON",
    "SUI",
    "UNI",
    "AAVE",
    "MKR",
    "ARB",
    "OP",
    "ATOM",
    "XLM",
    "XMR",
    "ETC",
    "FIL",
    "ICP",
    "NEAR",
    "HBAR",
    "APT",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def _num(value: Any) -> float | None:
    try:
        if value is None or pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def _norm_alias(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def load_universe(analytics_path: Path, profiles_path: Path, top_n: int) -> tuple[pd.DataFrame, dict[str, list[str]], dict[str, str]]:
    analytics = pd.read_csv(analytics_path)
    profiles = pd.read_csv(profiles_path)
    analytics["avg_daily_volume_usd"] = pd.to_numeric(analytics.get("avg_daily_volume_usd"), errors="coerce").fillna(0)
    analytics["rank"] = pd.to_numeric(analytics.get("rank"), errors="coerce") if "rank" in analytics.columns else np.nan
    ranked = analytics.sort_values(["avg_daily_volume_usd", "days_of_history"], ascending=[False, False]).head(top_n).copy()
    profiles_idx = profiles.set_index("coingecko_id", drop=False)

    alias_to_ids: dict[str, list[str]] = defaultdict(list)
    symbol_to_id: dict[str, str] = {}
    for row in ranked.to_dict("records"):
        cg_id = _clean_text(row.get("coingecko_id"))
        symbol = _clean_text(row.get("symbol")).upper()
        name = _clean_text(row.get("name"))
        aliases = {cg_id, symbol, name, cg_id.replace("-", " ")}
        if cg_id in profiles_idx.index:
            p = profiles_idx.loc[cg_id]
            aliases.add(_clean_text(p.get("web_slug")))
            aliases.add(_clean_text(p.get("name")))
        for alias in aliases:
            norm = _norm_alias(alias)
            if not norm:
                continue
            alias_to_ids[norm].append(cg_id)
        if symbol and (symbol in MAJOR_SYMBOLS or len(symbol) >= 3) and symbol not in symbol_to_id:
            symbol_to_id[symbol] = cg_id

    # Hard aliases for common names/symbols that appear in journalism.
    manual = {
        "bitcoin": "bitcoin",
        "btc": "bitcoin",
        "ethereum": "ethereum",
        "ether": "ethereum",
        "eth": "ethereum",
        "binance coin": "binancecoin",
        "bnb": "binancecoin",
        "solana": "solana",
        "sol": "solana",
        "xrp": "ripple",
        "ripple": "ripple",
        "cardano": "cardano",
        "ada": "cardano",
        "dogecoin": "dogecoin",
        "doge": "dogecoin",
        "tron": "tron",
        "trx": "tron",
        "avalanche": "avalanche-2",
        "avax": "avalanche-2",
        "chainlink": "chainlink",
        "link": "chainlink",
        "polkadot": "polkadot",
        "dot": "polkadot",
        "litecoin": "litecoin",
        "ltc": "litecoin",
        "bitcoin cash": "bitcoin-cash",
        "bch": "bitcoin-cash",
        "monero": "monero",
        "xmr": "monero",
    }
    valid_ids = set(ranked["coingecko_id"])
    for alias, cg_id in manual.items():
        if cg_id in valid_ids:
            alias_to_ids[_norm_alias(alias)].append(cg_id)
            symbol_to_id[alias.upper()] = cg_id

    alias_to_ids = {k: sorted(set(v)) for k, v in alias_to_ids.items()}
    return ranked, alias_to_ids, symbol_to_id


def _match_coin_ids(row: dict[str, Any], alias_to_ids: dict[str, list[str]], symbol_to_id: dict[str, str]) -> list[str]:
    hits: list[str] = []

    def add(cg_id: str) -> None:
        if cg_id and cg_id not in hits:
            hits.append(cg_id)

    asset_hint = _norm_alias(_clean_text(row.get("asset_hint")))
    if asset_hint in alias_to_ids:
        for cg_id in alias_to_ids[asset_hint]:
            add(cg_id)

    tag_text = " ".join(_clean_text(row.get(k)) for k in ("tags", "categories", "asset_hint"))
    for token in re.split(r"[^A-Za-z0-9]+", tag_text):
        token_u = token.upper()
        if token_u in symbol_to_id:
            add(symbol_to_id[token_u])

    text = " ".join(_clean_text(row.get(k)) for k in ("title", "text", "url", "publisher")).lower()
    padded = f" {_norm_alias(text)} "
    for alias, cg_ids in alias_to_ids.items():
        if len(alias) < 4 and alias.upper() not in MAJOR_SYMBOLS:
            continue
        if f" {alias} " in padded:
            for cg_id in cg_ids:
                add(cg_id)
                if len(hits) >= 5:
                    return hits
    return hits[:5]


def _sentiment_direction(label: Any, score: Any) -> float:
    text = _clean_text(label).lower()
    val = _num(score)
    if val is not None and not math.isnan(val):
        if -1.0 <= val <= 1.0:
            return val
        return (val - 0.5) * 2 if 0.0 <= val <= 1.0 else val
    if any(x in text for x in ("positive", "rise", "bull", "up")):
        return 1.0
    if any(x in text for x in ("negative", "fall", "bear", "down")):
        return -1.0
    return 0.0


def build_news_daily(
    news_path: Path,
    alias_to_ids: dict[str, list[str]],
    symbol_to_id: dict[str, str],
    chunksize: int = 50000,
) -> pd.DataFrame:
    agg: dict[tuple[str, str], Counter] = defaultdict(Counter)
    sums: dict[tuple[str, str], Counter] = defaultdict(Counter)
    publishers: dict[tuple[str, str], set[str]] = defaultdict(set)
    sources: dict[tuple[str, str], set[str]] = defaultdict(set)

    for chunk in pd.read_csv(news_path, chunksize=chunksize, low_memory=False):
        for row in chunk.to_dict("records"):
            date = _clean_text(row.get("date"))
            if not date:
                continue
            ids = _match_coin_ids(row, alias_to_ids, symbol_to_id)
            if not ids:
                continue
            record_type = _clean_text(row.get("record_type"))
            source_archive = _clean_text(row.get("source_archive"))
            sent = _sentiment_direction(row.get("sentiment_label"), row.get("sentiment_score"))
            impact = _num(row.get("impact_score"))
            expected = _num(row.get("expected_change_pct"))
            market_move = _clean_text(row.get("market_move")).lower()
            for cg_id in ids:
                key = (date, cg_id)
                agg[key]["news_records"] += 1
                if record_type == "gdelt_mention":
                    agg[key]["gdelt_mentions"] += 1
                    if _num(row.get("sentiment_score")) is not None:
                        sums[key]["gdelt_tone_sum"] += float(row.get("sentiment_score"))
                        agg[key]["gdelt_tone_n"] += 1
                if record_type.startswith("impact_label"):
                    agg[key]["impact_label_records"] += 1
                if record_type == "article_with_market_reaction":
                    agg[key]["reaction_labeled_records"] += 1
                if sent > 0:
                    agg[key]["sentiment_pos"] += 1
                elif sent < 0:
                    agg[key]["sentiment_neg"] += 1
                else:
                    agg[key]["sentiment_neu"] += 1
                sums[key]["sentiment_sum"] += sent
                if impact is not None:
                    sums[key]["impact_score_sum"] += impact
                    agg[key]["impact_score_n"] += 1
                if expected is not None:
                    sums[key]["expected_change_sum"] += expected
                    agg[key]["expected_change_n"] += 1
                if market_move == "up":
                    agg[key]["market_move_up"] += 1
                elif market_move == "down":
                    agg[key]["market_move_down"] += 1
                if row.get("publisher"):
                    publishers[key].add(_clean_text(row.get("publisher")))
                if source_archive:
                    sources[key].add(source_archive)

    rows = []
    for (date, cg_id), c in agg.items():
        n = c["news_records"]
        rows.append(
            {
                "date": date,
                "cg_id": cg_id,
                **dict(c),
                "publisher_count": len(publishers[(date, cg_id)]),
                "source_family_count": len(sources[(date, cg_id)]),
                "sentiment_mean": sums[(date, cg_id)]["sentiment_sum"] / n if n else 0.0,
                "sentiment_balance": (c["sentiment_pos"] - c["sentiment_neg"]) / n if n else 0.0,
                "impact_score_mean": sums[(date, cg_id)]["impact_score_sum"] / c["impact_score_n"]
                if c["impact_score_n"]
                else np.nan,
                "expected_change_mean": sums[(date, cg_id)]["expected_change_sum"] / c["expected_change_n"]
                if c["expected_change_n"]
                else np.nan,
                "gdelt_tone_mean": sums[(date, cg_id)]["gdelt_tone_sum"] / c["gdelt_tone_n"]
                if c["gdelt_tone_n"]
                else np.nan,
                "reaction_up_rate": c["market_move_up"] / (c["market_move_up"] + c["market_move_down"])
                if (c["market_move_up"] + c["market_move_down"])
                else np.nan,
            }
        )
    return pd.DataFrame(rows)


def build_reddit_daily(reddit_path: Path, symbol_to_id: dict[str, str]) -> pd.DataFrame:
    if not reddit_path.exists():
        return pd.DataFrame(columns=["date", "cg_id"])
    df = pd.read_csv(reddit_path)
    if df.empty:
        return pd.DataFrame(columns=["date", "cg_id"])
    df["Ticker"] = df["Ticker"].astype(str).str.upper()
    df["cg_id"] = df["Ticker"].map(symbol_to_id)
    df = df.dropna(subset=["cg_id"]).copy()
    df["date"] = pd.to_datetime(df["Date"], errors="coerce").dt.date.astype(str)
    keep = [
        "date",
        "cg_id",
        "mention_posts",
        "mention_occurrences",
        "unique_authors",
        "upvote_weighted_mentions",
        "sentiment_mean",
        "sentiment_upvote_weighted",
        "novelty_30d_ratio",
        "novelty_30d_z",
        "mention_comments",
        "comment_frac",
    ]
    out = df[keep].copy()
    return out.rename(columns={c: f"reddit_{c}" for c in keep if c not in {"date", "cg_id"}})


def build_reddit_raw_daily(
    raw_paths: list[Path], alias_to_ids: dict[str, list[str]], symbol_to_id: dict[str, str]
) -> pd.DataFrame:
    agg: dict[tuple[str, str], Counter] = defaultdict(Counter)
    seen_posts: set[str] = set()
    for path in raw_paths:
        if not path.exists():
            continue
        try:
            iterator = pd.read_json(path, lines=True, chunksize=10000)
        except Exception:
            continue
        for chunk in iterator:
            for row in chunk.to_dict("records"):
                post_id = _clean_text(row.get("id"))
                if post_id and post_id in seen_posts:
                    continue
                if post_id:
                    seen_posts.add(post_id)
                created = pd.to_datetime(row.get("created_utc"), unit="s", errors="coerce", utc=True)
                if pd.isna(created):
                    continue
                text = " ".join(_clean_text(row.get(k)) for k in ("title", "selftext", "url", "subreddit"))
                ids = _match_coin_ids(
                    {
                        "title": row.get("title"),
                        "text": row.get("selftext"),
                        "url": row.get("url"),
                        "publisher": row.get("subreddit"),
                    },
                    alias_to_ids,
                    symbol_to_id,
                )
                if not ids:
                    continue
                score = _num(row.get("score")) or 0.0
                comments = _num(row.get("num_comments")) or 0.0
                date = created.date().isoformat()
                for cg_id in ids:
                    key = (date, cg_id)
                    agg[key]["reddit_raw_posts"] += 1
                    agg[key]["reddit_raw_score"] += score
                    agg[key]["reddit_raw_comments"] += comments
                    if _clean_text(row.get("subreddit")).lower() in {"cryptocurrency", "bitcoin", "bitcoinmarkets", "ethfinance"}:
                        agg[key]["reddit_crypto_sub_posts"] += 1
    return pd.DataFrame([{"date": k[0], "cg_id": k[1], **dict(v)} for k, v in agg.items()])


def load_returns(price_path: Path, cg_ids: set[str]) -> pd.DataFrame:
    usecols = ["cg_id", "symbol", "name", "date", "price_usd", "volume_usd"]
    parts = []
    for chunk in pd.read_csv(price_path, usecols=usecols, chunksize=500000, low_memory=False):
        chunk = chunk[chunk["cg_id"].isin(cg_ids)].copy()
        if not chunk.empty:
            parts.append(chunk)
    if not parts:
        return pd.DataFrame()
    px = pd.concat(parts, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"], errors="coerce")
    px = px.dropna(subset=["date", "price_usd"]).sort_values(["cg_id", "date"])
    px["ret_1d"] = px.groupby("cg_id")["price_usd"].pct_change()
    for h in HORIZONS:
        px[f"fwd_{h}d_ret"] = px.groupby("cg_id")["price_usd"].shift(-h) / px["price_usd"] - 1.0
    px["date"] = px["date"].dt.date.astype(str)
    return px


def _t_stat(s: pd.Series) -> float:
    v = pd.to_numeric(s, errors="coerce").dropna().to_numpy(dtype=float)
    if len(v) < 2:
        return 0.0
    std = np.std(v, ddof=1)
    return 0.0 if std == 0 else float(np.mean(v) / (std / np.sqrt(len(v))))


def _robust_returns(series: pd.Series) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce").dropna()
    return s[(s > -0.95) & (s < 5.0)]


def summarize_event_study(panel: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    news_positive = panel.loc[panel["news_records"].fillna(0) > 0, "news_records"]
    reddit_attention = panel.loc[panel["reddit_total_posts"].fillna(0) > 0, "reddit_total_posts"]
    news_threshold = news_positive.quantile(0.9) if not news_positive.empty else np.inf
    reddit_threshold = reddit_attention.quantile(0.9) if not reddit_attention.empty else np.inf
    signal_defs = {
        "any_news": panel["news_records"].fillna(0) > 0,
        "high_news_count": panel["news_records"].fillna(0) >= news_threshold,
        "positive_news_sentiment": panel["sentiment_balance"].fillna(0) > 0.25,
        "negative_news_sentiment": panel["sentiment_balance"].fillna(0) < -0.25,
        "high_impact_score": panel["impact_score_mean"].fillna(-999) >= panel["impact_score_mean"].quantile(0.75),
        "any_reddit": panel["reddit_total_posts"].fillna(0) > 0,
        "high_reddit_attention": panel["reddit_total_posts"].fillna(0) >= reddit_threshold,
        "news_and_reddit": (panel["news_records"].fillna(0) > 0) & (panel["reddit_total_posts"].fillna(0) > 0),
    }
    rows = []
    for signal, mask in signal_defs.items():
        subset = panel[mask].copy()
        for h in HORIZONS:
            col = f"fwd_{h}d_ret"
            raw = pd.to_numeric(subset[col], errors="coerce").dropna()
            s = _robust_returns(raw)
            rows.append(
                {
                    "signal": signal,
                    "horizon": h,
                    "n": int(len(s)),
                    "raw_n": int(len(raw)),
                    "extreme_return_rows_dropped": int(len(raw) - len(s)),
                    "mean_return": float(s.mean()) if len(s) else np.nan,
                    "median_return": float(s.median()) if len(s) else np.nan,
                    "win_rate": float((s > 0).mean()) if len(s) else np.nan,
                    "t_stat": _t_stat(s),
                }
            )

    factor_cols = [
        "news_records",
        "sentiment_mean",
        "sentiment_balance",
        "impact_score_mean",
        "expected_change_mean",
        "gdelt_mentions",
        "gdelt_tone_mean",
        "reddit_mention_posts",
        "reddit_upvote_weighted_mentions",
        "reddit_sentiment_mean",
        "reddit_novelty_30d_z",
        "reddit_raw_posts",
        "reddit_raw_score",
        "reddit_raw_comments",
        "reddit_total_posts",
    ]
    corr_rows = []
    for factor in factor_cols:
        if factor not in panel.columns:
            continue
        x = pd.to_numeric(panel[factor], errors="coerce")
        for h in HORIZONS:
            y = pd.to_numeric(panel[f"fwd_{h}d_ret"], errors="coerce")
            valid = x.notna() & y.notna() & (y > -0.95) & (y < 5.0)
            if valid.sum() < 20:
                corr = np.nan
            else:
                corr = float(x[valid].corr(y[valid], method="spearman"))
            corr_rows.append({"factor": factor, "horizon": h, "n": int(valid.sum()), "spearman_corr": corr})
    return pd.DataFrame(rows), pd.DataFrame(corr_rows)


def write_report(summary: dict[str, Any], event_summary: pd.DataFrame, corr: pd.DataFrame, report: Path) -> None:
    top_events = event_summary.sort_values(["horizon", "mean_return"], ascending=[True, False]).head(20)
    top_corr = corr.dropna().sort_values("spearman_corr", ascending=False).head(20)
    lines = [
        "# Crypto News + Social Event Study",
        "",
        f"Generated: {_now_iso()}",
        "",
        "## Dataset",
        "",
        f"- Coin-date rows: {summary['panel_rows']}",
        f"- Coins covered: {summary['coins']}",
        f"- Date range: {summary['date_min']} to {summary['date_max']}",
        f"- Rows with news: {summary['rows_with_news']}",
    f"- Rows with Reddit: {summary['rows_with_reddit']}",
    f"- Rows with both: {summary['rows_with_both']}",
        "- Return summaries use a robust filter: `-95% < forward_return < 500%` to reduce bad penny-token artifacts.",
        "",
        "## Event Summary",
        "",
        top_events.to_csv(index=False),
        "",
        "## Strongest Rank Correlations",
        "",
        top_corr.to_csv(index=False),
        "",
        "## Files",
        "",
        f"- `{summary['out_dir']}/news_social_factor_panel.csv`",
        f"- `{summary['out_dir']}/event_study_summary.csv`",
        f"- `{summary['out_dir']}/factor_return_correlations.csv`",
    ]
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build news/social crypto event-study panel.")
    ap.add_argument("--news", type=Path, default=DEFAULT_NEWS)
    ap.add_argument("--price", type=Path, default=DEFAULT_PRICE)
    ap.add_argument("--profiles", type=Path, default=DEFAULT_PROFILES)
    ap.add_argument("--analytics", type=Path, default=DEFAULT_ANALYTICS)
    ap.add_argument("--reddit", type=Path, default=DEFAULT_REDDIT)
    ap.add_argument("--reddit-raw", type=Path, action="append", default=None)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--top-n", type=int, default=300)
    args = ap.parse_args()

    universe, alias_to_ids, symbol_to_id = load_universe(args.analytics, args.profiles, args.top_n)
    news_daily = build_news_daily(args.news, alias_to_ids, symbol_to_id)
    reddit_daily = build_reddit_daily(args.reddit, symbol_to_id)
    reddit_raw = build_reddit_raw_daily(args.reddit_raw or DEFAULT_REDDIT_RAW, alias_to_ids, symbol_to_id)
    cg_ids = set(news_daily.get("cg_id", pd.Series(dtype=str)).dropna()) | set(
        reddit_daily.get("cg_id", pd.Series(dtype=str)).dropna()
    ) | set(reddit_raw.get("cg_id", pd.Series(dtype=str)).dropna())
    prices = load_returns(args.price, cg_ids)

    panel = (
        prices.merge(news_daily, on=["date", "cg_id"], how="left")
        .merge(reddit_daily, on=["date", "cg_id"], how="left")
        .merge(reddit_raw, on=["date", "cg_id"], how="left")
    )
    count_cols = [c for c in panel.columns if c.endswith("_records") or c.endswith("_count") or c.endswith("_mentions")]
    count_cols += [c for c in ("reddit_raw_posts", "reddit_raw_score", "reddit_raw_comments", "reddit_crypto_sub_posts") if c in panel.columns]
    for col in count_cols:
        panel[col] = panel[col].fillna(0)
    panel["reddit_total_posts"] = panel.get("reddit_mention_posts", 0).fillna(0) + panel.get("reddit_raw_posts", 0).fillna(0)
    panel["has_news"] = panel["news_records"].fillna(0) > 0
    panel["has_reddit"] = panel["reddit_total_posts"].fillna(0) > 0
    panel["has_news_and_reddit"] = panel["has_news"] & panel["has_reddit"]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    panel.to_csv(args.out_dir / "news_social_factor_panel.csv", index=False)
    event_summary, corr = summarize_event_study(panel)
    event_summary.to_csv(args.out_dir / "event_study_summary.csv", index=False)
    corr.to_csv(args.out_dir / "factor_return_correlations.csv", index=False)

    summary = {
        "panel_rows": int(len(panel)),
        "coins": int(panel["cg_id"].nunique()),
        "date_min": str(panel["date"].min()) if not panel.empty else "",
        "date_max": str(panel["date"].max()) if not panel.empty else "",
        "rows_with_news": int(panel["has_news"].sum()),
        "rows_with_reddit": int(panel["has_reddit"].sum()),
        "rows_with_both": int(panel["has_news_and_reddit"].sum()),
        "out_dir": str(args.out_dir),
    }
    (args.out_dir / "event_study_summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    write_report(summary, event_summary, corr, args.report)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
