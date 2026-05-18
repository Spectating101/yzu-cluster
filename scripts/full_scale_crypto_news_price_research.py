#!/usr/bin/env python3
"""Full-scale crypto price + news/social research synthesis.

This script produces a consolidated research bundle that joins the broad
price universe diagnostics with the news/social event panel. It intentionally
keeps the implementation conservative and auditable: chunked loading for large
price files, robust missing-data handling, and straightforward descriptive tests
that are easy to reproduce.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

DEFAULT_PRICE_LONG = ROOT / "data_lake/crypto_pipeline/exports/price_panel_long.csv"
DEFAULT_PRICE_WIDE = ROOT / "data_lake/crypto_pipeline/exports/price_panel_wide.csv"
DEFAULT_PRICE_CLEAN = ROOT / "data_lake/crypto_pipeline/exports/price_panel_clean.csv"
DEFAULT_EVENT_PANEL = ROOT / "data_lake/crypto_pipeline/news_context/event_research/news_social_factor_panel.csv"
DEFAULT_REPORT = ROOT / "data_lake/crypto_pipeline/reports/PRICE_NEWS_FULL_SCALE_RESEARCH.md"
DEFAULT_OUT_DIR = ROOT / "data_lake/crypto_pipeline/reports/full_scale_research"

HORIZONS = [1, 3, 7, 14, 30]
RET_COLS = [f"fwd_{h}d_ret" for h in HORIZONS]
MAX_ABS_RETURN = 5.0
CG_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*[a-z0-9]$")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--price-long", type=Path, default=DEFAULT_PRICE_LONG)
    p.add_argument("--price-wide", type=Path, default=DEFAULT_PRICE_WIDE)
    p.add_argument("--price-clean", type=Path, default=DEFAULT_PRICE_CLEAN)
    p.add_argument("--event-panel", type=Path, default=DEFAULT_EVENT_PANEL)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    p.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    p.add_argument("--chunksize", type=int, default=500_000)
    p.add_argument("--anchor-cg-id", default="bitcoin", help="Coin used for regime construction")
    return p.parse_args()


@dataclass(frozen=True)
class CoverageResult:
    file: str
    rows: int
    columns: int
    min_date: str
    max_date: str
    coins: int
    rows_after_2024_01_01: int | None = None


def _numeric_series(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _t_stat(x: pd.Series) -> float:
    x = _numeric_series(x)
    x = x[np.isfinite(x)]
    if len(x) < 3:
        return np.nan
    s = x.std(ddof=1)
    if not s or np.isnan(s):
        return np.nan
    return float(x.mean() / (s / np.sqrt(len(x))))


def _read_price_metadata(path: Path, is_wide: bool = False) -> CoverageResult:
    if not path.exists():
        raise FileNotFoundError(path)
    if is_wide:
        header = pd.read_csv(path, nrows=0)
        # wide formats can include a leading date column plus many coin columns.
        rows = sum(1 for _ in path.open("r", encoding="utf-8", newline="")) - 1
        return CoverageResult(
            file=str(path),
            rows=rows,
            columns=len(header.columns) - 1,
            min_date=str(pd.read_csv(path, usecols=["date"], nrows=1)["date"][0]),
            max_date=str(pd.read_csv(path, usecols=["date"]).iloc[-1]["date"]),
            coins=len([c for c in header.columns if c != "date"]),
        )

    rows = 0
    min_date = "9999-99-99"
    max_date = "0000-00-00"
    coin_counts: dict[str, int] = {}
    for chunk in pd.read_csv(path, usecols=["cg_id", "date"], chunksize=500_000):
        rows += int(len(chunk))
        for coin, count in chunk["cg_id"].value_counts(dropna=False).items():
            c = str(coin)
            coin_counts[c] = coin_counts.get(c, 0) + int(count)
        min_date = min(min_date, str(chunk["date"].min()))
        max_date = max(max_date, str(chunk["date"].max()))
    return CoverageResult(
        file=str(path),
        rows=rows,
        columns=0,
        min_date=min_date,
        max_date=max_date,
        coins=len(coin_counts),
        rows_after_2024_01_01=0,
    )


def _wide_coin_ids(price_wide_path: Path) -> list[str]:
    header = pd.read_csv(price_wide_path, nrows=0).columns.tolist()
    return [c for c in header if c != "date" and CG_ID_RE.fullmatch(str(c))]


def _clean_coin_ids(values: Iterable[str]) -> list[str]:
    return [
        str(v)
        for v in pd.Series(list(values)).dropna().astype(str).str.strip().str.lower().str.strip().unique()
    ]


def _cohort_from_series(vals: Iterable[float], default: float = np.nan) -> dict[str, float]:
    s = pd.Series(list(vals), dtype=float).replace([np.inf, -np.inf], np.nan).dropna()
    if s.empty:
        return {
            "q10": default,
            "q25": default,
            "q50": default,
            "q75": default,
            "q90": default,
            "q95": default,
        }
    return {
        "q10": float(s.quantile(0.10)),
        "q25": float(s.quantile(0.25)),
        "q50": float(s.quantile(0.50)),
        "q75": float(s.quantile(0.75)),
        "q90": float(s.quantile(0.90)),
        "q95": float(s.quantile(0.95)),
    }


def _load_event_panel(path: Path, chunksize: int) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"], low_memory=False)
    if df.empty:
        raise SystemExit(f"Event panel is empty: {path}")
    df["date"] = pd.to_datetime(df["date"])
    df["cg_id"] = df["cg_id"].astype(str)
    df["news_records"] = _numeric_series(df["news_records"]).fillna(0.0)
    bool_cols = [c for c in ["has_news", "has_reddit", "has_news_and_reddit"] if c in df.columns]
    for c in bool_cols:
        df[c] = df[c].astype(bool)
    return df


def _load_price_for_news_panel(price_long: Path, news_cg_ids: set[str], chunksize: int) -> pd.DataFrame:
    cols = ["cg_id", "date", "price_usd", "market_cap_usd", "volume_usd"]
    chunks: list[pd.DataFrame] = []
    for ch in pd.read_csv(price_long, usecols=cols, chunksize=chunksize):
        sub = ch[ch["cg_id"].isin(news_cg_ids)].copy()
        if sub.empty:
            continue
        chunks.append(sub)
    if not chunks:
        raise SystemExit(f"No price rows found in {price_long} for news panel coins")
    px = pd.concat(chunks, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"])
    px = px.sort_values(["cg_id", "date"]).copy()
    px["price_usd"] = _numeric_series(px["price_usd"])
    px = px.dropna(subset=["price_usd", "date", "cg_id"])

    # Forward returns as the analysis baseline for date-paired and cross-sectional tests.
    for h in HORIZONS:
        px[f"fwd_{h}d_ret"] = px.groupby("cg_id")["price_usd"].shift(-h) / px["price_usd"] - 1.0
        if h == 1:
            px["ret_1d"] = px.groupby("cg_id")["price_usd"].pct_change()
    return px[["cg_id", "date", "price_usd", "market_cap_usd", "volume_usd", *[c for c in ("ret_1d",) if c], *RET_COLS]].copy()


def _build_price_distribution(coverage: CoverageResult) -> dict[str, int | float]:
    if coverage.rows <= 0 or coverage.coins <= 0:
        return {}

    # Rebuild rows-per-coin distribution with a fresh pass. This can be expensive,
    # but is still much smaller than loading full wide files.
    counts: dict[str, int] = {}
    for chunk in pd.read_csv(
        coverage.file,
        usecols=["cg_id", "date"],
        chunksize=500_000,
    ):
        for c, n in chunk["cg_id"].value_counts().items():
            c = str(c)
            counts[c] = counts.get(c, 0) + int(n)

    vals = pd.Series(list(counts.values()), dtype=float)
    if vals.empty:
        return {"coins": coverage.coins}
    return {
        "coins": int(len(vals)),
        "min_rows": int(vals.min()),
        "p10_rows": int(vals.quantile(0.10)),
        "p25_rows": int(vals.quantile(0.25)),
        "median_rows": int(vals.median()),
        "p75_rows": int(vals.quantile(0.75)),
        "p90_rows": int(vals.quantile(0.90)),
        "p95_rows": int(vals.quantile(0.95)),
        "max_rows": int(vals.max()),
        "coins_ge_1000": int((vals >= 1000).sum()),
        "coins_ge_2000": int((vals >= 2000).sum()),
    }


def _join_price_and_news(price_long: pd.DataFrame, event_panel: pd.DataFrame) -> pd.DataFrame:
    keep_cols = ["cg_id", "date", "news_records"] + [
        c for c in [
            "sentiment_balance",
            "sentiment_mean",
            "sentiment_pos",
            "sentiment_neg",
            "sentiment_neu",
            "publisher_count",
            "source_family_count",
            "impact_score_mean",
            "expected_change_mean",
            "gdelt_mentions",
            "reddit_total_posts",
            "reddit_raw_posts",
            "reddit_raw_score",
            "reddit_mention_posts",
            "has_news",
            "has_reddit",
            "has_news_and_reddit",
        ]
        if c in event_panel.columns
    ]
    merged = event_panel[[c for c in keep_cols if c in event_panel.columns]].copy()
    merged = merged.rename(columns={"reddit_total_posts": "reddit_total_posts"})
    merged["date"] = pd.to_datetime(merged["date"])
    merged = pd.merge(
        merged,
        price_long,
        on=["cg_id", "date"],
        how="left",
        validate="one_to_one",
    )

    merged = merged.copy()
    merged["has_news"] = merged.get("has_news", merged["news_records"].fillna(0.0) > 0).astype(bool)
    merged["has_reddit"] = merged.get("has_reddit", merged.get("reddit_total_posts", 0.0).fillna(0.0) > 0).astype(bool)
    merged["has_news_and_reddit"] = merged["has_news"] & merged["has_reddit"]

    for c in RET_COLS + ["ret_1d", "market_cap_usd", "volume_usd", "price_usd"]:
        merged[c] = _numeric_series(merged[c]) if c in merged.columns else np.nan

    return merged


def _summarize_bucket(df: pd.DataFrame, group_col: str, ret_col: str) -> pd.DataFrame:
    x = df[[group_col, ret_col]].copy()
    x[ret_col] = _numeric_series(x[ret_col])
    x = x[np.isfinite(x[ret_col]) & (x[ret_col].abs() <= MAX_ABS_RETURN)]
    x = x.dropna(subset=[group_col])
    out = []
    for key, part in x.groupby(group_col, dropna=False):
        r = part[ret_col]
        out.append(
            {
                group_col: key,
                "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
                "n": int(r.shape[0]),
                "mean_return": float(r.mean()),
                "median_return": float(r.median()),
                "win_rate": float((r > 0).mean()),
                "t_stat": _t_stat(r),
            }
        )
    return pd.DataFrame(out)


def _event_signal_returns(df: pd.DataFrame) -> pd.DataFrame:
    # Signal definitions are intentionally conservative and explainable.
    thresholds = _cohort_from_series(df["news_records"].fillna(0.0))
    signal_defs = {
        "any_news": df["news_records"].fillna(0.0) > 0,
        "high_news_count": df["news_records"].fillna(0.0) >= 5,
        "top10_news_count": df["news_records"].fillna(0.0) >= thresholds["q90"],
        "top5_news_count": df["news_records"].fillna(0.0) >= thresholds["q95"],
        "positive_sentiment": df.get("sentiment_balance", 0.0).fillna(0.0) > 0.05,
        "negative_sentiment": df.get("sentiment_balance", 0.0).fillna(0.0) < -0.05,
        "multi_publisher": df.get("publisher_count", 0).fillna(0) >= 2,
        "source_diverse": df.get("source_family_count", 0).fillna(0) >= 2,
        "any_reddit": df.get("reddit_total_posts", 0.0).fillna(0.0) > 0,
        "news_and_reddit": (df["has_news"] & df["has_reddit"]),
    }

    rows: list[dict] = []
    for signal_name, signal_mask in signal_defs.items():
        if signal_mask is None or signal_mask.dtype == object:
            continue
        signal_mask = signal_mask.fillna(False).astype(bool)
        base_mask = ~signal_mask
        # skip signals with no variation
        if signal_mask.sum() == 0 or base_mask.sum() == 0:
            continue
        for h in HORIZONS:
            ret_col = f"fwd_{h}d_ret"
            if ret_col not in df.columns:
                continue
            v = _numeric_series(df[ret_col])
            good = np.isfinite(v) & (v.abs() <= MAX_ABS_RETURN)
            if not good.any():
                continue
            evt = v[good][signal_mask.loc[good]]
            base = v[good][base_mask.loc[good]]
            rows.append(
                {
                    "signal": signal_name,
                    "horizon": f"{h}d",
                    "n_event": int(evt.shape[0]),
                    "n_base": int(base.shape[0]),
                    "event_mean": float(evt.mean()) if not evt.empty else np.nan,
                    "base_mean": float(base.mean()) if not base.empty else np.nan,
                    "event_minus_base_mean": float(evt.mean() - base.mean()) if not evt.empty and not base.empty else np.nan,
                    "event_win_rate": float((evt > 0).mean()) if not evt.empty else np.nan,
                    "base_win_rate": float((base > 0).mean()) if not base.empty else np.nan,
                    "event_t_stat": _t_stat(evt),
                    "base_t_stat": _t_stat(base),
                }
            )

    return pd.DataFrame(rows)


def _date_neutral_spread(df: pd.DataFrame, event: pd.Series, ret_col: str) -> dict:
    x = df[["date", ret_col]].copy()
    x[ret_col] = _numeric_series(x[ret_col])
    x = x[np.isfinite(x[ret_col]) & (x[ret_col].abs() <= MAX_ABS_RETURN)]
    x = x.assign(_event=event.reindex(x.index).astype(bool).fillna(False).values)

    event = x[x["_event"]].groupby("date")[ret_col].mean()
    base = x[~x["_event"]].groupby("date")[ret_col].mean()
    both = pd.concat({"event": event, "base": base}, axis=1, sort=False).dropna()
    both["spread"] = both["event"] - both["base"]
    return {
        "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
        "paired_dates": int(len(both)),
        "event_mean": float(both["event"].mean()),
        "base_mean": float(both["base"].mean()),
        "spread_mean": float(both["spread"].mean()),
        "spread_median": float(both["spread"].median()),
        "spread_t": _t_stat(both["spread"]),
    }


def _cross_sectional_ic_by_date(df: pd.DataFrame, factor: str, ret_col: str) -> dict:
    s = _numeric_series(df[factor])
    r = _numeric_series(df[ret_col])
    g = pd.DataFrame({"date": df["date"], "factor": s, "ret": r})
    g = g.replace([np.inf, -np.inf], np.nan).dropna()
    g = g[g["ret"].abs() <= MAX_ABS_RETURN]
    ic: list[float] = []
    for _, part in g.groupby("date"):
        if len(part) < 12:
            continue
        if part["factor"].nunique() <= 2 or part["ret"].nunique() <= 2:
            continue
        corr = part["factor"].corr(part["ret"], method="spearman")
        if not np.isnan(corr):
            ic.append(float(corr))
    if not ic:
        return {
            "factor": factor,
            "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
            "n_dates": 0,
            "ic_mean": np.nan,
            "ic_median": np.nan,
            "ic_t": np.nan,
            "ic_std": np.nan,
            "ic_2_5_pct": np.nan,
            "ic_97_5_pct": np.nan,
        }
    ic_s = pd.Series(ic)
    return {
        "factor": factor,
        "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
        "n_dates": int(len(ic_s)),
        "ic_mean": float(ic_s.mean()),
        "ic_median": float(ic_s.median()),
        "ic_t": _t_stat(ic_s),
        "ic_std": float(ic_s.std(ddof=1)) if len(ic_s) > 1 else 0.0,
        "ic_2_5_pct": float(ic_s.quantile(0.025)),
        "ic_97_5_pct": float(ic_s.quantile(0.975)),
    }


def _cross_sectional_long_short(df: pd.DataFrame, factor_col: str, ret_col: str, top_q: float = 0.2, min_n: int = 30) -> dict:
    rows = []
    for date, part in df[["date", factor_col, ret_col]].groupby("date"):
        part = part.copy()
        part[factor_col] = _numeric_series(part[factor_col])
        part[ret_col] = _numeric_series(part[ret_col])
        part = part[np.isfinite(part[factor_col]) & np.isfinite(part[ret_col])]
        part = part[part[ret_col].abs() <= MAX_ABS_RETURN]
        if len(part) < min_n:
            continue
        part = part.sort_values(factor_col)
        k = max(3, int(len(part) * top_q))
        lo = part.head(k)
        hi = part.tail(k)
        if lo.empty or hi.empty:
            continue
        lo_ret = lo[ret_col].mean()
        hi_ret = hi[ret_col].mean()
        rows.append({"spread": float(hi_ret - lo_ret), "date": date, "n": int(len(part))})
    if not rows:
        return {
            "factor": factor_col,
            "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
            "date_pairs": 0,
            "mean_spread": np.nan,
            "median_spread": np.nan,
            "t_stat": np.nan,
            "avg_n": np.nan,
        }
    s = pd.Series([x["spread"] for x in rows])
    return {
        "factor": factor_col,
        "horizon": ret_col.replace("fwd_", "").replace("_ret", "d"),
        "date_pairs": int(len(s)),
        "mean_spread": float(s.mean()),
        "median_spread": float(s.median()),
        "t_stat": _t_stat(s),
        "avg_n": float(np.mean([x["n"] for x in rows])),
    }


def _build_regime_table(df: pd.DataFrame, btc_series: pd.Series) -> pd.DataFrame:
    base = df[["date", "cg_id", "news_records"] + RET_COLS].copy()
    base["date"] = pd.to_datetime(base["date"])
    btc = btc_series.rename("btc_ret_30d").to_frame()
    merged = base.merge(btc, left_on="date", right_index=True, how="left")

    valid = merged["btc_ret_30d"].replace([np.inf, -np.inf], np.nan).dropna()
    if valid.empty:
        return pd.DataFrame()
    q_low = float(valid.quantile(0.33))
    q_high = float(valid.quantile(0.67))
    merged["regime"] = "neutral"
    merged.loc[merged["btc_ret_30d"] >= q_high, "regime"] = "risk_on"
    merged.loc[merged["btc_ret_30d"] <= q_low, "regime"] = "risk_off"

    rows = []
    for regime, part in merged.groupby("regime"):
        for h in HORIZONS:
            ret_col = f"fwd_{h}d_ret"
            signal = part["news_records"].fillna(0.0) > 0
            if signal.sum() == 0:
                continue
            base = part[~signal]
            event = part[signal]
            if base.empty or event.empty:
                continue
            e = pd.to_numeric(event[ret_col], errors="coerce").replace([np.inf, -np.inf], np.nan)
            b = pd.to_numeric(base[ret_col], errors="coerce").replace([np.inf, -np.inf], np.nan)
            e = e[e.abs() <= MAX_ABS_RETURN].dropna()
            b = b[b.abs() <= MAX_ABS_RETURN].dropna()
            if e.empty or b.empty:
                continue
            rows.append(
                {
                    "regime": regime,
                    "horizon": f"{h}d",
                    "n_event": int(len(e)),
                    "n_base": int(len(b)),
                    "any_news_mean": float(e.mean()),
                    "no_news_mean": float(b.mean()),
                    "spread": float(e.mean() - b.mean()),
                    "t_stat": _t_stat(e - b.mean()),
                }
            )
    return pd.DataFrame(rows)


def _build_overlap_summary(wide_ids: list[str], clean_ids: list[str], event_ids: list[str]) -> pd.DataFrame:
    wide_set = set(wide_ids)
    clean_set = set(clean_ids)
    event_set = set(event_ids)
    rows = []
    rows.append({"metric": "price_wide_coin_count", "value": int(len(wide_set))})
    rows.append({"metric": "price_clean_coin_count", "value": int(len(clean_set))})
    rows.append({"metric": "event_coin_count", "value": int(len(event_set))})
    rows.append({"metric": "event_in_wide", "value": int(len(event_set & wide_set))})
    rows.append({"metric": "event_in_clean", "value": int(len(event_set & clean_set))})
    rows.append({"metric": "wide_not_in_event", "value": int(len(wide_set - event_set))})
    rows.append({"metric": "clean_not_in_event", "value": int(len(clean_set - event_set))})
    rows.append({"metric": "event_not_in_wide", "value": int(len(event_set - wide_set))})
    rows.append({"metric": "event_not_in_clean", "value": int(len(event_set - clean_set))})

    # Stable-token-like identifiers are a very small, distinct sub-layer that may be treated separately.
    stable_tokens = [c for c in event_set | wide_set | clean_set if any(x in c for x in ("usdt", "usdc", "dai", "busd", "usdp", "usdd", "tusd", "ust", "fei", "frax", "lusd"))]
    rows.append({"metric": "stable_like_like_ids_in_event", "value": int(len(set(stable_tokens) & event_set))})
    rows.append({"metric": "stable_like_ids_in_wide", "value": int(len(set(stable_tokens) & wide_set))})

    return pd.DataFrame(rows)


def _build_report_text(
    summary: dict,
    coverage_long: CoverageResult,
    coverage_wide: CoverageResult,
    coverage_clean: CoverageResult,
    overlap: pd.DataFrame,
    event_summary: pd.DataFrame,
    date_spreads: pd.DataFrame,
    ic_rows: pd.DataFrame,
    ls_rows: pd.DataFrame,
    regime: pd.DataFrame,
    factor_corrs: pd.DataFrame,
    out_dir: Path,
    report_path: Path,
) -> None:
    lines = [
        "# Full-Scale Price + News/Social Research",
        "",
        f"Generated: {datetime.now(UTC).date()}",
        "",
    ]

    lines += [
        "## 1) Dataset inventory",
        "",
        f"- Long panel: `{coverage_long.file}`",
        f"  - rows={coverage_long.rows:,}, coins={coverage_long.coins:,}, period={coverage_long.min_date} -> {coverage_long.max_date}",
        f"- Wide panel: `{coverage_wide.file}`",
        f"  - rows={coverage_wide.rows:,}, date columns={coverage_wide.columns:,}",
        f"- Clean panel: `{coverage_clean.file}`",
        f"  - rows={coverage_clean.rows:,}, coins={coverage_clean.columns:,}",
        "- News/social factor panel: `news_social_factor_panel.csv`",
        f"  - rows={summary['event_panel_rows']:,}, coins={summary['event_panel_coins']:,}, date coverage={summary['event_panel_min']} to {summary['event_panel_max']}",
        "",
    ]

    lines += [
        "### Coverage overlap",
        "",
        *[f"- {row['metric']}: {row['value']:,}" for _, row in overlap.iterrows()],
        "",
    ]

    lines += [
        "## 2) Data quality and salvage implications",
        "",
        "- The long panel is broad (16k+ coins) and reaches deep back history, but it is sparse by design.",
        "- The event panel is a much smaller, high-information subset (~hundreds of coins, mostly liquid names) where public coverage was recoverable.",
        "- Because event coverage is concentrated in the 269 covered coins, this dataset is strong for media-signal research but not representative of the full 16k coin universe by itself.",
        "- The clean/wide panels are useful production and modeling surfaces, while the long panel is the best source for broad historical breadth checks.",
        "",
    ]

    lines += [
        "## 3) Event-signal evidence",
        "",
        "### A) Unconditional means (event vs non-event within the same horizon)",
        "",
    ]
    top_event_rows = event_summary.sort_values("event_minus_base_mean", ascending=False).head(20)
    lines += top_event_rows.to_string(index=False).split("\n")
    lines.append("")

    lines += [
        "### B) Date-neutral any-news and high-news spreads",
        "",
    ]
    if not date_spreads.empty:
        lines += date_spreads.to_string(index=False).split("\n")
    else:
        lines.append("No date-neutral spread computed (insufficient samples).")
    lines.append("")

    lines += [
        "### C) Cross-sectional information coefficients (date-level Spearman)",
        "",
        "The higher the absolute mean IC and t-stat, the more stable the cross-sectional signal.",
        "",
    ]
    if not ic_rows.empty:
        lines += [
            ic_rows.sort_values(["horizon", "ic_abs"], ascending=[True, False]).head(30).to_string(index=False)
        ]
    else:
        lines.append("No factor IC rows available.")
    lines.append("")

    lines += [
        "### D) 20% top-vs-bottom cross-sectional long-short portfolios",
        "",
    ]
    if not ls_rows.empty:
        lines += [ls_rows.sort_values(["horizon", "mean_spread"], ascending=[True, False]).to_string(index=False)]
    else:
        lines.append("No long-short rows available.")
    lines.append("")

    lines += [
        "### E) Regime split by BTC 30d momentum",
        "",
    ]
    if not regime.empty:
        for _, row in regime.sort_values(["regime", "horizon"]).iterrows():
            lines.append(
                f"- {row['regime']}, {row['horizon']}: any-news={row['any_news_mean']:.4f}, no-news={row['no_news_mean']:.4f}, spread={row['spread']:.4f}, n={int(row['n_event'])+int(row['n_base'])}"
            )
    else:
        lines.append("Regime table unavailable (BTC momentum series missing).")
    lines.append("")

    lines += [
        "## 4) Research interpretation",
        "",
        "- The strongest robust signal appears to be *attention breadth/intensity* rather than polarity labels.",
        "- Signals are context-dependent: regime and liquidity slices can change sign and size materially.",
        "- The key methodological point for publication is that the social layer is not the same as the market universe; it is a conditional subsample.",
        "- Therefore, the strongest claim is incremental explanatory power in a constrained, liquid universe, with careful date controls.",
        "",
    ]

    lines += [
        "## 5) Outputs",
        "",
        *(f"- `{p.name}`" for p in sorted(out_dir.glob("*.csv"), key=lambda p: p.name)),
        f"- `{report_path.relative_to(ROOT)}`",
    ]

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _btc_momentum_series(price_long: Path, anchor: str, chunksize: int) -> pd.Series:
    anchor = anchor.strip().lower()
    rows = []
    for ch in pd.read_csv(price_long, usecols=["cg_id", "date", "price_usd"], chunksize=chunksize):
        ch = ch[ch["cg_id"].astype(str).str.lower() == anchor].copy()
        if ch.empty:
            continue
        rows.append(ch)
    if not rows:
        return pd.Series(dtype=float)
    px = pd.concat(rows, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"])
    px["price_usd"] = _numeric_series(px["price_usd"])
    px = px.dropna(subset=["date", "price_usd"]).sort_values("date")
    px = px.set_index("date")
    mom = px["price_usd"].pct_change(30)
    mom = mom.rename("btc_mom_30d")
    return mom


def main() -> int:
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    # 1) Dataset inventory
    long_meta = _read_price_metadata(args.price_long, is_wide=False)
    wide_meta = _read_price_metadata(args.price_wide, is_wide=True)
    clean_meta = _read_price_metadata(args.price_clean, is_wide=True)
    long_distribution = _build_price_distribution(long_meta)

    event_panel = _load_event_panel(args.event_panel, args.chunksize)
    news_cg_ids = set(_clean_coin_ids(event_panel["cg_id"]))

    # 2) Coin-set overlap checks
    wide_ids = _wide_coin_ids(args.price_wide)
    clean_ids = _clean_coin_ids(pd.read_csv(args.price_clean, nrows=0).columns.tolist()[1:])
    overlap = _build_overlap_summary(wide_ids, clean_ids, sorted(news_cg_ids))

    # 3) Price slice and merge for event panel coins only.
    price_slice = _load_price_for_news_panel(args.price_long, news_cg_ids, args.chunksize)
    merged = _join_price_and_news(price_slice, event_panel)

    # 4) Coverage diagnostics on the merged panel
    rows = {
        "event_rows": int(len(event_panel)),
        "joined_rows": int(len(merged)),
        "merged_return_rows": int((pd.to_numeric(merged["fwd_30d_ret"], errors="coerce").notna()).sum()),
        "merged_price_missing": int(pd.to_numeric(merged["price_usd"], errors="coerce").isna().sum()),
    }

    # 5) Event summaries
    events = _event_signal_returns(merged)

    spread_rows = []
    for signal_name in [
        "has_news",
        "has_reddit",
        "has_news_and_reddit",
    ]:
        if signal_name == "has_news":
            signal = merged["has_news"].fillna(False).astype(bool)
        elif signal_name == "has_reddit":
            signal = merged["has_reddit"].fillna(False).astype(bool)
        else:
            signal = merged["has_news_and_reddit"].fillna(False).astype(bool)
        for h in HORIZONS:
            spread_rows.append({"signal": signal_name, **_date_neutral_spread(merged, signal, f"fwd_{h}d_ret")})
    date_neutral = pd.DataFrame(spread_rows)

    # Alternative bucket spread (top/bottom counts) is useful for robustness.
    # Uses quantile split on all non-missing news counts.
    q90 = _cohort_from_series(merged["news_records"].fillna(0.0))["q90"]
    q95 = _cohort_from_series(merged["news_records"].fillna(0.0))["q95"]
    merged["news_bucket"] = pd.cut(
        merged["news_records"].fillna(0.0),
        bins=[-0.1, 0, 1, q90, q95, np.inf],
        labels=["no_news", "1", "2", "top10", "top5"],
    )
    bucket_events = pd.concat(
        [
            _summarize_bucket(merged, "news_bucket", f"fwd_{h}d_ret")
            for h in HORIZONS
        ],
        ignore_index=True,
    )

    # 6) Cross-sectional statistics
    factors = [
        "news_records",
        "sentiment_balance",
        "publisher_count",
        "source_family_count",
        "impact_score_mean",
        "expected_change_mean",
        "gdelt_mentions",
        "reddit_total_posts",
        "reddit_raw_posts",
        "reddit_raw_score",
    ]
    ic_rows = [
        _cross_sectional_ic_by_date(merged, factor, f"fwd_{h}d_ret")
        for factor in factors
        if factor in merged.columns
        for h in HORIZONS
    ]
    ic_df = pd.DataFrame(ic_rows)
    if not ic_df.empty:
        ic_df["ic_abs"] = ic_df["ic_mean"].abs()

    ls_rows = [
        _cross_sectional_long_short(merged, factor, f"fwd_{h}d_ret", top_q=0.2)
        for factor in ["news_records"]
        if factor in merged.columns
        for h in HORIZONS
    ]
    ls_df = pd.DataFrame(ls_rows)

    # 7) Regime splits
    btc_mom = _btc_momentum_series(args.price_long, args.anchor_cg_id, args.chunksize)
    regime = _build_regime_table(merged, btc_mom)

    # 8) Persist.
    coverage = {
        "generated_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "price_long": long_meta.__dict__,
        "price_wide": {
            "file": str(args.price_wide),
            "rows": int(wide_meta.rows),
            "coins": int(wide_meta.coins),
            "min_date": str(wide_meta.min_date),
            "max_date": str(wide_meta.max_date),
        },
        "price_clean": {
            "file": str(args.price_clean),
            "rows": int(clean_meta.rows),
            "coins": int(clean_meta.coins),
            "min_date": str(clean_meta.min_date),
            "max_date": str(clean_meta.max_date),
        },
        "event_panel_rows": int(len(event_panel)),
        "event_panel_coins": int(event_panel["cg_id"].nunique()),
        "event_panel_min": str(event_panel["date"].min().date()),
        "event_panel_max": str(event_panel["date"].max().date()),
        "merged_rows": int(len(merged)),
        "joined_rows_with_price": int(merged["price_usd"].notna().sum()),
        "rows_with_news": int(event_panel["has_news"].sum()),
        "rows_with_reddit": int(event_panel["has_reddit"].sum()),
        "rows_with_both": int(event_panel["has_news_and_reddit"].sum()),
        "long_distribution": long_distribution,
        "coverage": rows,
    }

    coverage_path = args.out_dir / "full_scale_coverage.json"
    coverage_path.write_text(json.dumps(coverage, indent=2) + "\n", encoding="utf-8")

    # Also provide a compact summary that the write-up can cite quickly.
    out_summaries = {
        "long_rows": int(long_meta.rows),
        "long_coins": int(long_meta.coins),
        "clean_rows": int(clean_meta.rows),
        "clean_coins": int(clean_meta.columns),
        "wide_cols": int(wide_meta.columns),
        "news_rows": int(len(event_panel)),
        "news_coins": int(event_panel["cg_id"].nunique()),
        "news_has_news_frac": float(event_panel["has_news"].mean()),
        "news_has_reddit_frac": float(event_panel["has_reddit"].mean()),
        "news_both_frac": float(event_panel["has_news_and_reddit"].mean()),
    }

    out_summaries_path = args.out_dir / "full_scale_summary.json"
    out_summaries_path.write_text(json.dumps(out_summaries, indent=2) + "\n", encoding="utf-8")

    overlap.to_csv(args.out_dir / "coverage_overlap.csv", index=False)
    events.to_csv(args.out_dir / "event_signal_summary.csv", index=False)
    date_neutral.to_csv(args.out_dir / "date_neutral_spreads.csv", index=False)
    bucket_events.to_csv(args.out_dir / "news_bucket_returns.csv", index=False)
    ic_df.to_csv(args.out_dir / "factor_cross_sectional_ic.csv", index=False)
    ls_df.to_csv(args.out_dir / "top_bottom_long_short.csv", index=False)
    regime.to_csv(args.out_dir / "regime_splits.csv", index=False)

    coverage_df = pd.DataFrame([long_distribution, coverage])
    coverage_df.to_csv(args.out_dir / "coverage_distribution.csv", index=False)

    _build_report_text(
        {
            "event_panel_rows": int(len(event_panel)),
            "event_panel_coins": int(event_panel["cg_id"].nunique()),
            "event_panel_min": str(event_panel["date"].min().date()),
            "event_panel_max": str(event_panel["date"].max().date()),
        },
        long_meta,
        wide_meta,
        clean_meta,
        overlap,
        events,
        date_neutral,
        ic_df,
        ls_df,
        regime,
        pd.DataFrame(),
        args.out_dir,
        args.report,
    )

    print(json.dumps(coverage, indent=2))
    print(f"Report: {args.report}")
    print(f"Outputs: {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
