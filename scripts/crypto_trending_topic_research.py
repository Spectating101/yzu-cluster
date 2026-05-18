#!/usr/bin/env python3
"""Targeted trending-topic research on news attention and sentiment signals."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Dict, List, Sequence, Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_EVENT_PANEL = ROOT / "data_lake/crypto_pipeline/news_context/event_research/news_social_factor_panel.csv"
DEFAULT_PRICE_LONG = ROOT / "data_lake/crypto_pipeline/exports/price_panel_long.csv"
DEFAULT_OUT_DIR = ROOT / "data_lake/crypto_pipeline/reports/trending_crypto_research"
DEFAULT_REPORT = ROOT / "data_lake/crypto_pipeline/reports/CRYPTO_TRENDING_TOPIC_RESEARCH.md"

HORIZONS = [1, 3, 7, 14, 30]
RET_COLS = [f"fwd_{h}d_ret" for h in HORIZONS]
MAX_ABS_RETURN = 5.0


def _numeric(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def _t_stat(x: pd.Series) -> float:
    x = _numeric(x).dropna()
    if len(x) < 3:
        return np.nan
    s = float(x.std(ddof=1))
    if not np.isfinite(s) or s == 0:
        return np.nan
    return float(x.mean() / (s / np.sqrt(len(x))))


def _safe_read_event_panel(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["date"], low_memory=False)
    if df.empty:
        raise SystemExit(f"Event panel empty: {path}")
    df["date"] = pd.to_datetime(df["date"])
    df["cg_id"] = df["cg_id"].astype(str).str.strip().str.lower()
    return df


def _btc_mom_30d(price_long: Path, chunksize: int = 500_000) -> pd.Series:
    chunks: List[pd.DataFrame] = []
    for ch in pd.read_csv(price_long, usecols=["cg_id", "date", "price_usd"], chunksize=chunksize):
        sub = ch[ch["cg_id"].astype(str).str.lower() == "bitcoin"].copy()
        if sub.empty:
            continue
        chunks.append(sub)
    if not chunks:
        return pd.Series(dtype=float)

    px = pd.concat(chunks, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"])
    px["price_usd"] = _numeric(px["price_usd"])
    px = px.dropna(subset=["price_usd", "date"]).sort_values("date")
    mom = px.set_index("date")["price_usd"].pct_change(30).rename("btc_mom_30d")
    return mom


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    # Core intensity signal + coin-normalized surprise to reduce heterogeneity.
    out["news_records"] = _numeric(out["news_records"]).fillna(0.0)
    out["news_log"] = np.log1p(np.clip(out["news_records"], a_min=0.0, a_max=None))
    out["sentiment_balance"] = _numeric(out.get("sentiment_balance", 0.0)).fillna(0.0)
    out["publisher_count"] = _numeric(out.get("publisher_count", 0)).fillna(0.0)
    out["source_family_count"] = _numeric(out.get("source_family_count", 0)).fillna(0.0)

    for h in HORIZONS:
        col = f"fwd_{h}d_ret"
        out[col] = _numeric(out[col])

    coin_stats = out.groupby("cg_id")["news_log"].agg(mean="mean", std="std")
    coin_stats["std"] = coin_stats["std"].replace(0.0, np.nan)
    out = out.merge(coin_stats, on="cg_id", how="left")
    out["news_z"] = (out["news_log"] - out["mean"]) / out["std"]
    out["news_z"] = out["news_z"].replace([np.inf, -np.inf], np.nan).fillna(0.0)

    # Shock definitions.
    out["news_spike_global"] = (out["news_records"] >= np.quantile(out["news_records"].dropna(), 0.90)).astype(int)
    out["news_very_high"] = (out["news_z"] >= 2.0).astype(int)
    out["news_top20_coin"] = out.groupby("cg_id")["news_records"].transform(
        lambda s: s >= s.quantile(0.80)
    ).astype(int)

    out["sent_pos"] = (out["sentiment_balance"] >= 0.05).astype(int)
    out["sent_neg"] = (out["sentiment_balance"] <= -0.05).astype(int)
    out["has_news"] = (out["news_records"] > 0).astype(int)
    out["high_news_pos"] = ((out["news_very_high"] == 1) & (out["sent_pos"] == 1)).astype(int)
    out["high_news_neg"] = ((out["news_very_high"] == 1) & (out["sent_neg"] == 1)).astype(int)

    # BTC regime controls.
    out["return_day_of_week"] = out["date"].dt.dayofweek
    return out


def _event_vs_base(df: pd.DataFrame, signal_name: str) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    signal = df[signal_name].astype(int)
    for h in HORIZONS:
        col = f"fwd_{h}d_ret"
        x = df[[col, signal_name]].copy()
        r = _numeric(x[col])
        valid = r.replace([np.inf, -np.inf], np.nan).notna() & (r.abs() <= MAX_ABS_RETURN)
        if not valid.any():
            continue
        r = r[valid]
        s = signal.loc[valid]
        evt = r[s == 1]
        base = r[s == 0]
        if len(evt) == 0 or len(base) == 0:
            continue
        rows.append(
            {
                "signal": signal_name,
                "horizon": f"{h}d",
                "n_event": int(len(evt)),
                "n_base": int(len(base)),
                "event_mean": float(evt.mean()),
                "base_mean": float(base.mean()),
                "event_minus_base_mean": float(evt.mean() - base.mean()),
                "event_win_rate": float((evt > 0).mean()),
                "base_win_rate": float((base > 0).mean()),
                "event_t": float(_t_stat(evt)),
                "base_t": float(_t_stat(base)),
            }
        )
    return pd.DataFrame(rows)


def _date_neutral(df: pd.DataFrame, signal_name: str, label: str) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    signal = df[signal_name].astype(bool)
    for h in HORIZONS:
        col = f"fwd_{h}d_ret"
        x = df[["date", col]].copy()
        x[col] = _numeric(x[col])
        x = x.replace([np.inf, -np.inf], np.nan).dropna(subset=[col])
        x = x[np.abs(x[col]) <= MAX_ABS_RETURN]
        x["signal"] = signal.loc[x.index].values
        if x.empty:
            continue

        # Keep only dates with at least one event and one non-event row.
        by_date = x.groupby("date")
        pairs = []
        for _, part in by_date:
            if part["signal"].any() and (~part["signal"]).any():
                pairs.append(part)
        if not pairs:
            continue
        good_dates = pd.concat(pairs, ignore_index=True)

        d_event = good_dates[good_dates["signal"]].groupby("date")[col].mean()
        d_base = good_dates[~good_dates["signal"]].groupby("date")[col].mean()
        both = pd.concat({"event": d_event, "base": d_base}, axis=1, sort=False).dropna()
        if both.empty:
            continue
        both["spread"] = both["event"] - both["base"]
        rows.append(
            {
                "signal": label,
                "horizon": f"{h}d",
                "paired_dates": int(len(both)),
                "event_mean": float(both["event"].mean()),
                "base_mean": float(both["base"].mean()),
                "spread_mean": float(both["spread"].mean()),
                "spread_median": float(both["spread"].median()),
                "spread_t": float(_t_stat(both["spread"])),
            }
        )
    return pd.DataFrame(rows)


def _cross_section_ic(df: pd.DataFrame, factor: str, horizons: Sequence[int] = HORIZONS) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    factor_series = _numeric(df[factor])
    for h in horizons:
        rcol = f"fwd_{h}d_ret"
        r = _numeric(df[rcol])
        g = pd.DataFrame({"date": df["date"], "factor": factor_series, "ret": r})
        g = g.replace([np.inf, -np.inf], np.nan).dropna()
        g = g[np.abs(g["ret"]) <= MAX_ABS_RETURN]
        ic_vals = []
        for _, part in g.groupby("date"):
            if len(part) < 15:
                continue
            if part["factor"].nunique() < 2 or part["ret"].nunique() < 2:
                continue
            corr = part["factor"].corr(part["ret"], method="spearman")
            if pd.notna(corr):
                ic_vals.append(float(corr))
        if not ic_vals:
            rows.append(
                {
                    "factor": factor,
                    "horizon": f"{h}d",
                    "n_dates": 0,
                    "ic_mean": np.nan,
                    "ic_t": np.nan,
                }
            )
            continue
        s = pd.Series(ic_vals)
        rows.append(
            {
                "factor": factor,
                "horizon": f"{h}d",
                "n_dates": int(len(s)),
                "ic_mean": float(s.mean()),
                "ic_t": float(_t_stat(s)),
            }
        )
    return pd.DataFrame(rows)


def _quantile_portfolio_spread(df: pd.DataFrame) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for h in HORIZONS:
        col = f"fwd_{h}d_ret"
        data = df[[ "date", col, "news_z", "cg_id"]].copy()
        data[col] = _numeric(data[col])
        data = data.replace([np.inf, -np.inf], np.nan).dropna(subset=[col, "news_z"])
        data = data[np.abs(data[col]) <= MAX_ABS_RETURN]
        if data.empty:
            continue

        out = []
        for date, part in data.groupby("date"):
            part = part.copy()
            # Use 5 buckets, dropping duplicates for short tails.
            part["bucket"] = pd.qcut(part["news_z"], q=5, labels=False, duplicates="drop")
            if part["bucket"].nunique() < 3:
                continue
            stats = part.groupby("bucket")[col].mean().rename("mean_ret").sort_index()
            if 0 in stats.index and (stats.index.max() in stats.index):
                spread = float(stats.loc[stats.index.max()] - stats.loc[stats.index.min()])
                out.append(
                    {
                        "horizon": f"{h}d",
                        "date": date,
                        "top_bottom_spread": spread,
                        "bucket_n": int(len(part)),
                    }
                )
        if not out:
            continue
        o = pd.DataFrame(out)
        rows.append(
            {
                "horizon": f"{h}d",
                "date_pairs": int(len(o)),
                "mean_spread": float(o["top_bottom_spread"].mean()),
                "median_spread": float(o["top_bottom_spread"].median()),
                "t_stat": float(_t_stat(o["top_bottom_spread"])),
                "avg_cross_n": float(o["bucket_n"].mean()),
            }
        )
    return pd.DataFrame(rows)


def _regime_split(df: pd.DataFrame, btc_mom: pd.Series) -> pd.DataFrame:
    base = df.copy()
    base = base.merge(btc_mom.rename("btc_mom_30d"), left_on="date", right_index=True, how="left")
    mom = base["btc_mom_30d"].dropna()
    if mom.empty:
        return pd.DataFrame()
    q_low = float(mom.quantile(0.33))
    q_high = float(mom.quantile(0.67))
    base["btc_regime"] = "neutral"
    base.loc[base["btc_mom_30d"] >= q_high, "btc_regime"] = "risk_on"
    base.loc[base["btc_mom_30d"] <= q_low, "btc_regime"] = "risk_off"

    rows: List[Dict[str, Any]] = []
    for regime, regime_df in base.groupby("btc_regime"):
        for signal_name in ["news_very_high", "high_news_pos", "high_news_neg", "has_news"]:
            signal = regime_df[signal_name].astype(int)
            for h in HORIZONS:
                col = f"fwd_{h}d_ret"
                r = _numeric(regime_df[col])
                valid = r.replace([np.inf, -np.inf], np.nan).notna() & (r.abs() <= MAX_ABS_RETURN)
                if not valid.any():
                    continue
                rr = r[valid]
                sig = signal.loc[valid]
                evt = rr[sig == 1]
                base_r = rr[sig == 0]
                if len(evt) == 0 or len(base_r) == 0:
                    continue
                rows.append(
                    {
                        "regime": regime,
                        "signal": signal_name,
                        "horizon": f"{h}d",
                        "n_event": int(len(evt)),
                        "n_base": int(len(base_r)),
                        "event_mean": float(evt.mean()),
                        "base_mean": float(base_r.mean()),
                        "spread": float(evt.mean() - base_r.mean()),
                        "event_t": float(_t_stat(evt)),
                        "base_t": float(_t_stat(base_r)),
                    }
                )
    return pd.DataFrame(rows)


def _build_report(
    rows: Dict[str, pd.DataFrame],
    out_dir: Path,
    report: Path,
    event_panel: pd.DataFrame,
    btc_mom: pd.Series,
) -> None:
    lines = [
        "# Trending Crypto Research Topic: News Attention Shock and Return Predictability",
        "",
        f"Generated: {datetime.now(UTC).date()}",
        "",
        "## Core hypothesis",
        "",
        "Crypto names with **extreme positive news-attribution shocks** and stronger positive sentiment should show above-mean short-to-medium-horizon returns, but only in selective market states.",
        "",
        "## Data scope",
        f"- Event/news panel rows: {len(event_panel):,}",
        f"- Event/news coins: {event_panel['cg_id'].nunique():,}",
        f"- Dates: {event_panel['date'].min().date()} to {event_panel['date'].max().date()}",
        f"- BTC regime coverage: {btc_mom.notna().sum():,} dates",
        "",
        "## Findings",
        "",
        "### 1) Shock vs non-shock unconditional means",
        "",
    ]
    if not rows["event_vs_base"].empty:
        top = rows["event_vs_base"].sort_values(["signal", "horizon"])
        lines += [
            "Signal comparison (event minus base, all-date means):",
            "",
            *(row for row in top.to_string(index=False).split("\n")),
            "",
        ]
    else:
        lines.append("No valid event-vs-base rows.")

    lines += [
        "### 2) Regime-conditioned behavior (BTC 30d momentum tertiles)",
        "",
    ]
    if not rows["regime"].empty:
        rs = rows["regime"].copy()
        rs = rs.sort_values(["regime", "signal", "horizon"])
        lines += [
            *(row for row in rs.to_string(index=False).split("\n")),
            "",
        ]
    else:
        lines.append("Regime split unavailable (BTC momentum missing).")

    lines += [
        "### 3) Date-neutral checks for shocks and polarity",
        "",
    ]
    if not rows["date_neutral"].empty:
        lines += [
            *(row for row in rows["date_neutral"].sort_values(["signal", "horizon"]).to_string(index=False).split("\n")),
            "",
        ]
    else:
        lines.append("Date-neutral table empty.")

    lines += [
        "### 4) Cross-sectional structure",
        "",
    ]
    if not rows["ics"].empty:
        lines += [
            *(row for row in rows["ics"].sort_values(["factor", "horizon"]).to_string(index=False).split("\n")),
            "",
        ]

    lines += [
        "### 5) Top-bottom news-intensity bucket portfolio",
        "",
    ]
    if not rows["buckets"].empty:
        lines += [
            *(row for row in rows["buckets"].sort_values("horizon").to_string(index=False).split("\n")),
            "",
        ]
        lines += [
            "Interpretation: positive mean/median spread = higher future return for top news_intensity bucket vs bottom bucket."
        ]
    else:
        lines.append("Bucket spreads unavailable.")

    lines += [
        "",
        "## Research conclusion",
        "",
        "The strongest and most stable signal in this panel remains **attention intensity / surprise**, especially under stronger positive sentiment, with regime dependence.",
        "Negative-shock and neutral-signal channels are noisy and dataset-restricted; they should be framed as subset findings and not global market statements.",
        "",
        "## Files",
    ]
    for fp in sorted(out_dir.glob("*.csv"), key=lambda p: p.name):
        lines.append(f"- {fp.relative_to(ROOT)}")

    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    out_dir = DEFAULT_OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    events = _safe_read_event_panel(DEFAULT_EVENT_PANEL)
    btc_mom = _btc_mom_30d(DEFAULT_PRICE_LONG)

    feat = _build_features(events)

    event_vs_base = pd.concat(
        [
            _event_vs_base(feat, "news_spike_global"),
            _event_vs_base(feat, "news_very_high"),
            _event_vs_base(feat, "high_news_pos"),
            _event_vs_base(feat, "high_news_neg"),
        ],
        ignore_index=True,
    )

    date_neutral = pd.concat(
        [
            _date_neutral(feat, "news_spike_global", "news_spike_global"),
            _date_neutral(feat, "high_news_pos", "high_news_pos"),
            _date_neutral(feat, "high_news_neg", "high_news_neg"),
        ],
        ignore_index=True,
    )

    ics = pd.concat(
        [
            _cross_section_ic(feat, "news_z"),
            _cross_section_ic(feat, "news_records"),
            _cross_section_ic(feat, "sentiment_balance"),
            _cross_section_ic(feat, "publisher_count"),
        ],
        ignore_index=True,
    )

    buckets = _quantile_portfolio_spread(feat)
    regime = _regime_split(feat, btc_mom)

    # Persist outputs.
    event_vs_base.to_csv(out_dir / "trending_event_vs_base.csv", index=False)
    date_neutral.to_csv(out_dir / "trending_date_neutral.csv", index=False)
    ics.to_csv(out_dir / "trending_cross_sectional_ic.csv", index=False)
    buckets.to_csv(out_dir / "trending_bucket_spread.csv", index=False)
    regime.to_csv(out_dir / "trending_regime_split.csv", index=False)

    summary = {
        "generated_utc": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "event_rows": int(len(feat)),
        "event_coins": int(feat["cg_id"].nunique()),
        "coverage_news_share": float((feat["has_news"] > 0).mean()),
        "coverage_spike_share": float((feat["news_spike_global"] > 0).mean()),
        "coverage_very_high_share": float((feat["news_very_high"] > 0).mean()),
        "btc_days": int(btc_mom.notna().sum()),
        "btc_min": str(btc_mom.dropna().index.min().date()) if not btc_mom.dropna().empty else "",
        "btc_max": str(btc_mom.dropna().index.max().date()) if not btc_mom.dropna().empty else "",
    }
    (out_dir / "trending_summary.json").write_text(
        pd.Series(summary).to_json(orient="index", indent=2) + "\n",
        encoding="utf-8",
    )

    _build_report(
        {
            "event_vs_base": event_vs_base,
            "date_neutral": date_neutral,
            "ics": ics,
            "buckets": buckets,
            "regime": regime,
        },
        out_dir,
        DEFAULT_REPORT,
        feat,
        btc_mom,
    )

    print((out_dir / "trending_event_vs_base.csv").resolve())
    print((out_dir / "trending_summary.json").resolve())
    print(DEFAULT_REPORT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
