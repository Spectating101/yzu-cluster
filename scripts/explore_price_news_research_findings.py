#!/usr/bin/env python3
"""Exploratory price/news research findings.

This script keeps the analysis deliberately simple and auditable: it builds
bucket tables, rank information coefficients, and date-neutral event spreads
from the existing token-day news/social factor panel.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "data_lake/crypto_pipeline/news_context/event_research/news_social_factor_panel.csv"
OUT_DIR = ROOT / "data_lake/crypto_pipeline/news_context/event_research/exploratory_findings"
REPORT = ROOT / "data_lake/crypto_pipeline/reports/PRICE_NEWS_EXPLORATORY_FINDINGS.md"

HORIZONS = [1, 3, 7, 14, 30]
RET_COLS = [f"fwd_{h}d_ret" for h in HORIZONS]
MAX_ABS_RETURN = 10.0


def t_stat(x: pd.Series) -> float:
    x = pd.to_numeric(x, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if len(x) < 2:
        return np.nan
    sd = x.std(ddof=1)
    if not sd or np.isnan(sd):
        return np.nan
    return float(x.mean() / (sd / math.sqrt(len(x))))


def summarise(df: pd.DataFrame, group_col: str, ret_col: str) -> pd.DataFrame:
    clean = df[[group_col, ret_col]].copy()
    clean[ret_col] = pd.to_numeric(clean[ret_col], errors="coerce")
    clean = clean[np.isfinite(clean[ret_col]) & (clean[ret_col].abs() <= MAX_ABS_RETURN)]
    rows = []
    for key, part in clean.groupby(group_col, dropna=False, sort=False):
        r = part[ret_col]
        rows.append(
            {
                group_col: key,
                "horizon": ret_col.replace("fwd_", "").replace("_ret", ""),
                "n": int(r.notna().sum()),
                "mean_return": float(r.mean()),
                "median_return": float(r.median()),
                "win_rate": float((r > 0).mean()),
                "t_stat": t_stat(r),
            }
        )
    return pd.DataFrame(rows)


def date_neutral_spread(
    df: pd.DataFrame,
    event_col: str,
    ret_col: str,
    event_value: object = True,
    base_value: object = False,
) -> dict:
    clean = df[["date", event_col, ret_col]].copy()
    clean[ret_col] = pd.to_numeric(clean[ret_col], errors="coerce")
    clean = clean[np.isfinite(clean[ret_col]) & (clean[ret_col].abs() <= MAX_ABS_RETURN)]
    event = clean[clean[event_col] == event_value].groupby("date")[ret_col].mean()
    base = clean[clean[event_col] == base_value].groupby("date")[ret_col].mean()
    paired = pd.concat({"event": event, "base": base}, axis=1, sort=False).dropna()
    paired["spread"] = paired["event"] - paired["base"]
    return {
        "event": event_col,
        "horizon": ret_col.replace("fwd_", "").replace("_ret", ""),
        "paired_dates": int(len(paired)),
        "event_mean": float(paired["event"].mean()) if len(paired) else np.nan,
        "base_mean": float(paired["base"].mean()) if len(paired) else np.nan,
        "mean_spread": float(paired["spread"].mean()) if len(paired) else np.nan,
        "median_spread": float(paired["spread"].median()) if len(paired) else np.nan,
        "spread_t_stat": t_stat(paired["spread"]) if len(paired) else np.nan,
    }


def bucket_date_spreads(df: pd.DataFrame, bucket_col: str, base_bucket: str, ret_col: str) -> pd.DataFrame:
    clean = df[["date", bucket_col, ret_col]].copy()
    clean[ret_col] = pd.to_numeric(clean[ret_col], errors="coerce")
    clean = clean[np.isfinite(clean[ret_col]) & (clean[ret_col].abs() <= MAX_ABS_RETURN)]
    base = clean[clean[bucket_col] == base_bucket].groupby("date")[ret_col].mean()
    rows = []
    for bucket in clean[bucket_col].dropna().unique():
        if bucket == base_bucket:
            continue
        event = clean[clean[bucket_col] == bucket].groupby("date")[ret_col].mean()
        paired = pd.concat({"event": event, "base": base}, axis=1, sort=False).dropna()
        spread = paired["event"] - paired["base"]
        rows.append(
            {
                "bucket": str(bucket),
                "base_bucket": base_bucket,
                "horizon": ret_col.replace("fwd_", "").replace("_ret", ""),
                "paired_dates": int(len(paired)),
                "event_mean": float(paired["event"].mean()) if len(paired) else np.nan,
                "base_mean": float(paired["base"].mean()) if len(paired) else np.nan,
                "mean_spread": float(spread.mean()) if len(paired) else np.nan,
                "median_spread": float(spread.median()) if len(paired) else np.nan,
                "spread_t_stat": t_stat(spread) if len(paired) else np.nan,
            }
        )
    return pd.DataFrame(rows)


def yearly_attention_spreads(df: pd.DataFrame, ret_col: str) -> pd.DataFrame:
    clean = df[["date", "has_news", ret_col]].copy()
    clean["year"] = clean["date"].dt.year
    clean[ret_col] = pd.to_numeric(clean[ret_col], errors="coerce")
    clean = clean[np.isfinite(clean[ret_col]) & (clean[ret_col].abs() <= MAX_ABS_RETURN)]
    rows = []
    for year, part in clean.groupby("year"):
        event = part[part["has_news"]].groupby("date")[ret_col].mean()
        base = part[~part["has_news"]].groupby("date")[ret_col].mean()
        paired = pd.concat({"event": event, "base": base}, axis=1, sort=False).dropna()
        if len(paired) < 20:
            continue
        spread = paired["event"] - paired["base"]
        rows.append(
            {
                "year": int(year),
                "horizon": ret_col.replace("fwd_", "").replace("_ret", ""),
                "paired_dates": int(len(paired)),
                "event_mean": float(paired["event"].mean()),
                "base_mean": float(paired["base"].mean()),
                "mean_spread": float(spread.mean()),
                "median_spread": float(spread.median()),
                "spread_t_stat": t_stat(spread),
            }
        )
    return pd.DataFrame(rows)


def spearman_by_horizon(df: pd.DataFrame, factor: str) -> list[dict]:
    rows = []
    for h, ret_col in zip(HORIZONS, RET_COLS):
        clean = df[[factor, ret_col]].copy()
        clean[factor] = pd.to_numeric(clean[factor], errors="coerce")
        clean[ret_col] = pd.to_numeric(clean[ret_col], errors="coerce")
        clean = clean[np.isfinite(clean[factor]) & np.isfinite(clean[ret_col])]
        clean = clean[clean[ret_col].abs() <= MAX_ABS_RETURN]
        corr = clean[factor].corr(clean[ret_col], method="spearman") if len(clean) else np.nan
        rows.append({"factor": factor, "horizon": f"{h}d", "n": int(len(clean)), "spearman_corr": corr})
    return rows


def write_markdown(
    panel_shape: tuple[int, int],
    date_min: str,
    date_max: str,
    coin_count: int,
    attention_spreads: pd.DataFrame,
    attention_buckets: pd.DataFrame,
    sentiment_buckets: pd.DataFrame,
    publisher_buckets: pd.DataFrame,
    correlations: pd.DataFrame,
    social_buckets: pd.DataFrame,
    bucket_spreads: pd.DataFrame,
    yearly_spreads: pd.DataFrame,
) -> None:
    def fmt_pct(x: float) -> str:
        return "NA" if pd.isna(x) else f"{x * 100:.2f}%"

    def fmt_num(x: float) -> str:
        return "NA" if pd.isna(x) else f"{x:.3f}"

    lines = [
        "# Price + News Exploratory Findings",
        "",
        "Generated: 2026-05-06",
        "",
        "## Scope",
        "",
        f"- Panel rows: {panel_shape[0]:,}",
        f"- Panel columns: {panel_shape[1]:,}",
        f"- Coins: {coin_count:,}",
        f"- Period: {date_min} to {date_max}",
        "- Return filter: forward returns with absolute value above 1,000% are excluded from summary statistics.",
        "",
        "## Main Findings",
        "",
    ]

    spread_30 = attention_spreads[attention_spreads["horizon"] == "30d"].iloc[0]
    spread_14 = attention_spreads[attention_spreads["horizon"] == "14d"].iloc[0]
    y2024 = yearly_spreads[(yearly_spreads["year"] == 2024) & (yearly_spreads["horizon"] == "30d")].iloc[0]
    y2025 = yearly_spreads[(yearly_spreads["year"] == 2025) & (yearly_spreads["horizon"] == "30d")].iloc[0]
    lines += [
        "### 1. The news effect is regime-dependent, not a simple universal alpha",
        "",
        "The broad any-news signal is weaker after pairing news-positive and no-news coin-days on the same calendar date.",
        f"The date-paired any-news spread is {fmt_pct(spread_14['mean_spread'])} at 14d "
        f"(t={fmt_num(spread_14['spread_t_stat'])}) and {fmt_pct(spread_30['mean_spread'])} at 30d "
        f"(t={fmt_num(spread_30['spread_t_stat'])}).",
        f"However, the sign flips by regime: in 2024 the 30d same-date spread is {fmt_pct(y2024['mean_spread'])} "
        f"(t={fmt_num(y2024['spread_t_stat'])}), and in 2025 it is {fmt_pct(y2025['mean_spread'])} "
        f"(t={fmt_num(y2025['spread_t_stat'])}).",
        "",
    ]

    high_30 = attention_buckets[
        (attention_buckets["bucket"] == "high_5_plus") & (attention_buckets["horizon"] == "30d")
    ].iloc[0]
    no_30 = attention_buckets[
        (attention_buckets["bucket"] == "no_news") & (attention_buckets["horizon"] == "30d")
    ].iloc[0]
    high_spread_30 = bucket_spreads[
        (bucket_spreads["bucket"] == "high_5_plus") & (bucket_spreads["horizon"] == "30d")
    ].iloc[0]
    lines += [
        "### 2. Intensity matters in raw returns, but needs controls",
        "",
        f"High-intensity news days (`news_records >= 5`) show {fmt_pct(high_30['mean_return'])} average 30d forward return "
        f"versus {fmt_pct(no_30['mean_return'])} for no-news rows. But same-date high-news versus no-news spread is "
        f"{fmt_pct(high_spread_30['mean_spread'])} at 30d (t={fmt_num(high_spread_30['spread_t_stat'])}), with a "
        f"median spread of {fmt_pct(high_spread_30['median_spread'])}. This is a promising signal shape, but not yet a clean alpha claim.",
        "",
    ]

    corr_news_30 = correlations[(correlations["factor"] == "news_records") & (correlations["horizon"] == "30d")].iloc[0]
    corr_sent_30 = correlations[
        (correlations["factor"] == "sentiment_balance") & (correlations["horizon"] == "30d")
    ].iloc[0]
    lines += [
        "### 3. Attention appears cleaner than sentiment",
        "",
        f"`news_records` has 30d Spearman correlation {corr_news_30['spearman_corr']:.4f}, while "
        f"`sentiment_balance` is only {corr_sent_30['spearman_corr']:.4f}. This supports an attention-flow hypothesis: "
        "the fact that a token is being covered may matter more than the polarity label.",
        "",
    ]

    multi_pub = publisher_buckets[
        (publisher_buckets["bucket"] == "multi_publisher") & (publisher_buckets["horizon"] == "30d")
    ].iloc[0]
    single_pub = publisher_buckets[
        (publisher_buckets["bucket"] == "single_publisher") & (publisher_buckets["horizon"] == "30d")
    ].iloc[0]
    lines += [
        "### 4. Publisher breadth is not clearly better yet",
        "",
        f"Multi-publisher news days have {fmt_pct(multi_pub['mean_return'])} average 30d forward return, compared with "
        f"{fmt_pct(single_pub['mean_return'])} for single-publisher news days. Breadth still matters as a robustness variable, "
        "but this first pass does not prove that broader coverage is stronger than one-source coverage.",
        "",
    ]

    reddit_30 = social_buckets[(social_buckets["bucket"] == "reddit_only_or_any") & (social_buckets["horizon"] == "30d")]
    if len(reddit_30):
        reddit_row = reddit_30.iloc[0]
        lines += [
            "### 5. The current Reddit/social layer is not yet a reliable positive signal",
            "",
            f"Rows with Reddit activity have {fmt_pct(reddit_row['mean_return'])} average 30d forward return across "
            f"{int(reddit_row['n']):,} observations. The sample is sparse and likely selection-biased, so this should be "
            "used as a diagnostic/social-confirmation layer, not as a primary result yet.",
            "",
        ]

    lines += [
        "## Researchable Conclusions",
        "",
        "1. The strongest immediate paper angle is regime-dependent media attention: news coverage was not uniformly positive, but it became strongly positive versus peers in 2024-2025.",
        "2. The secondary angle is attention versus sentiment: attention intensity looks more useful than noisy polarity labels.",
        "3. Publisher diversity is useful as a robustness filter, but it is not yet a standalone positive signal.",
        "4. The social layer needs enrichment before it can carry a central claim.",
        "",
        "## Required Robustness Before Academic Claims",
        "",
        "- Rebuild the joined panel against the repaired full CoinGecko price panel through 2026-04-17.",
        "- Add liquidity, market-cap, stablecoin, wrapped-token, and category filters.",
        "- Run date fixed-effect and coin fixed-effect regressions.",
        "- Test whether the signal survives excluding BTC/ETH and top-10 assets.",
        "- Compare against prior momentum and volume shocks to avoid mistaking price-led news coverage for predictive news.",
        "",
        "## Output Tables",
        "",
        "- `attention_bucket_returns.csv`",
        "- `date_neutral_attention_spreads.csv`",
        "- `attention_bucket_date_spreads.csv`",
        "- `yearly_attention_spreads.csv`",
        "- `sentiment_bucket_returns.csv`",
        "- `publisher_breadth_returns.csv`",
        "- `factor_rank_correlations.csv`",
        "- `social_confirmation_returns.csv`",
    ]

    REPORT.write_text("\n".join(lines) + "\n")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(PANEL, parse_dates=["date"])
    df["has_news"] = df["has_news"].astype(bool)
    df["has_reddit"] = df["has_reddit"].astype(bool)
    df["has_news_and_reddit"] = df["has_news_and_reddit"].astype(bool)

    df["attention_bucket"] = pd.cut(
        df["news_records"].fillna(0),
        bins=[-0.1, 0, 1, 4, np.inf],
        labels=["no_news", "one_article", "two_to_four", "high_5_plus"],
    )
    df["sentiment_bucket"] = np.select(
        [
            ~df["has_news"],
            df["sentiment_balance"] > 0,
            df["sentiment_balance"] < 0,
            df["sentiment_balance"].fillna(0) == 0,
        ],
        ["no_news", "positive_balance", "negative_balance", "neutral_or_unknown"],
        default="neutral_or_unknown",
    )
    df["publisher_bucket"] = np.select(
        [
            ~df["has_news"],
            df["publisher_count"].fillna(0) <= 1,
            df["publisher_count"].fillna(0) > 1,
        ],
        ["no_news", "single_publisher", "multi_publisher"],
        default="no_news",
    )
    df["social_bucket"] = np.select(
        [
            df["has_news_and_reddit"],
            df["has_news"] & ~df["has_reddit"],
            df["has_reddit"],
        ],
        ["news_and_reddit", "news_only", "reddit_only_or_any"],
        default="neither",
    )

    attention = pd.concat([summarise(df.rename(columns={"attention_bucket": "bucket"}), "bucket", c) for c in RET_COLS])
    sentiment = pd.concat([summarise(df.rename(columns={"sentiment_bucket": "bucket"}), "bucket", c) for c in RET_COLS])
    publisher = pd.concat([summarise(df.rename(columns={"publisher_bucket": "bucket"}), "bucket", c) for c in RET_COLS])
    social = pd.concat([summarise(df.rename(columns={"social_bucket": "bucket"}), "bucket", c) for c in RET_COLS])

    spreads = pd.DataFrame([date_neutral_spread(df, "has_news", c) for c in RET_COLS])
    bucket_spreads = pd.concat([bucket_date_spreads(df, "attention_bucket", "no_news", c) for c in RET_COLS])
    yearly_spreads = pd.concat([yearly_attention_spreads(df, c) for c in RET_COLS])
    correlations = pd.DataFrame(
        row
        for factor in [
            "news_records",
            "publisher_count",
            "source_family_count",
            "sentiment_balance",
            "sentiment_mean",
            "impact_score_mean",
            "expected_change_mean",
            "reddit_raw_posts",
            "reddit_raw_score",
        ]
        for row in spearman_by_horizon(df, factor)
    )

    attention.to_csv(OUT_DIR / "attention_bucket_returns.csv", index=False)
    sentiment.to_csv(OUT_DIR / "sentiment_bucket_returns.csv", index=False)
    publisher.to_csv(OUT_DIR / "publisher_breadth_returns.csv", index=False)
    social.to_csv(OUT_DIR / "social_confirmation_returns.csv", index=False)
    spreads.to_csv(OUT_DIR / "date_neutral_attention_spreads.csv", index=False)
    bucket_spreads.to_csv(OUT_DIR / "attention_bucket_date_spreads.csv", index=False)
    yearly_spreads.to_csv(OUT_DIR / "yearly_attention_spreads.csv", index=False)
    correlations.to_csv(OUT_DIR / "factor_rank_correlations.csv", index=False)

    manifest = {
        "panel": str(PANEL.relative_to(ROOT)),
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "coins": int(df["cg_id"].nunique()),
        "date_min": str(df["date"].min().date()),
        "date_max": str(df["date"].max().date()),
        "outputs": [p.name for p in sorted(OUT_DIR.glob("*.csv"))],
        "report": str(REPORT.relative_to(ROOT)),
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    write_markdown(
        df.shape,
        str(df["date"].min().date()),
        str(df["date"].max().date()),
        int(df["cg_id"].nunique()),
        spreads,
        attention,
        sentiment,
        publisher,
        correlations,
        social,
        bucket_spreads,
        yearly_spreads,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
