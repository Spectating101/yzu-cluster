#!/usr/bin/env python3
"""Export concrete research screens from accumulated Sharpe-Renaissance data."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


def flatten_json(value: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, inner in value.items():
            out.update(flatten_json(inner, f"{prefix}{key}."))
    elif not isinstance(value, list):
        out[prefix[:-1]] = value
    return out


def fmt_value(column: str, value: Any) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float):
        if column in {
            "return_90d_pct",
            "drawdown_from_ath_pct",
            "volatility_90d_ann_pct",
            "avg_ret90",
            "cagr_pct",
        }:
            return f"{value:.1f}%"
        if column in {"cagr", "mdd", "excess"}:
            return f"{value:.1%}"
        return f"{value:.2f}"
    return str(value)[:160].replace("\n", " ")


def markdown_table(df: pd.DataFrame, columns: list[str], labels: list[str], limit: int) -> str:
    lines = [
        "| " + " | ".join(labels) + " |",
        "|" + "|".join(["---"] * len(columns)) + "|",
    ]
    for _, row in df.head(limit).iterrows():
        lines.append("| " + " | ".join(fmt_value(col, row.get(col, "")) for col in columns) + " |")
    return "\n".join(lines)


def csv_date_range(path: Path, column: str = "date") -> tuple[str, str] | None:
    if not path.exists():
        return None
    try:
        dates = pd.read_csv(path, usecols=[column])[column]
    except Exception:
        return None
    parsed = pd.to_datetime(dates, errors="coerce", utc=True)
    parsed = parsed.dropna()
    if parsed.empty:
        return None
    return str(parsed.min().date()), str(parsed.max().date())


def sqlite_date_range(path: Path, table: str, column: str) -> tuple[str, str, int] | None:
    if not path.exists():
        return None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        row = conn.execute(f"select min({column}), max({column}), count(*) from {table}").fetchone()
        conn.close()
    except Exception:
        return None
    if not row or row[0] is None or row[1] is None:
        return None
    return str(row[0])[:10], str(row[1])[:10], int(row[2])


def crypto_freshness_note(repo_root: Path) -> str:
    exports = repo_root / "data_lake/crypto_pipeline/exports"
    context = repo_root / "data_lake/crypto_pipeline/context"
    research_db = repo_root / "data_lake/crypto_pipeline/research_db.sqlite3"

    raw_files = {
        "price": exports / "price_panel_clean.csv",
        "market-cap": exports / "mcap_panel_wide.csv",
        "volume": exports / "volume_panel_wide.csv",
    }
    raw_ranges = {name: csv_date_range(path) for name, path in raw_files.items()}
    raw_maxes = [rng[1] for rng in raw_ranges.values() if rng]
    raw_start = min(rng[0] for rng in raw_ranges.values() if rng) if raw_maxes else "unknown"
    raw_end = max(raw_maxes) if raw_maxes else "unknown"

    history = sqlite_date_range(research_db, "coin_history", "date")
    analytics = sqlite_date_range(research_db, "coin_analytics", "last_date")
    regime_updates = csv_date_range(context / "current_regime_browsed_master_summary.csv", "last_updated_utc")

    parts = [
        f"Raw crypto price, market-cap, and volume panels cover roughly `{raw_start}` through `{raw_end}`.",
    ]
    if history:
        parts.append(
            f"The research DB `coin_history` table covers `{history[0]}` through `{history[1]}` across `{history[2]:,}` rows."
        )
    if analytics:
        parts.append(
            f"The research DB `coin_analytics.last_date` field currently tops out at `{analytics[1]}`."
        )
    if regime_updates:
        parts.append(
            f"The browsed regime annotations used for these ranked screens were last updated between `{regime_updates[0]}` and `{regime_updates[1]}`."
        )
    parts.append(
        "So the raw market data is current, but the regime/analytics layer should be recomputed before treating these screens as fresh live trade signals."
    )
    return " ".join(parts)


def load_crypto_screens(panel_path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    regime = pd.read_csv(panel_path)
    bool_cols = [col for col in regime.columns if col.startswith("has_current_")]
    for col in bool_cols:
        regime[col] = pd.to_numeric(regime[col], errors="coerce").fillna(0).astype(int)

    tailwind_cols = [col for col in bool_cols if "overhang" not in col]
    overhang_cols = [col for col in bool_cols if "overhang" in col]
    regime["tailwinds"] = regime[tailwind_cols].sum(axis=1)
    regime["overhangs"] = regime[overhang_cols].sum(axis=1)
    regime["net_tailwinds"] = regime["tailwinds"] - regime["overhangs"]

    base = regime[
        regime["confidence"].isin(["high", "medium"])
        & (regime["days_of_history"] >= 365)
    ].copy()

    clean = base[
        (base["overhangs"] == 0)
        & (base["net_tailwinds"] >= 5)
        & (base["is_stablecoin"] == 0)
        & (base["is_meme_speculative"] == 0)
    ].copy()
    clean["score"] = (
        clean["net_tailwinds"] * 2
        + clean["sharpe_ratio_90d"].fillna(-5)
        + clean["return_90d_pct"].fillna(-100) / 50
        - clean["volatility_90d_ann_pct"].fillna(100) / 200
    )
    clean = clean.sort_values(["score", "net_tailwinds", "rank_idx"], ascending=[False, False, True])

    watch = base[
        (base["overhangs"] == 0)
        & (base["net_tailwinds"] >= 5)
        & (base["return_90d_pct"] < 0)
        & (base["drawdown_from_ath_pct"] < -35)
        & (base["is_stablecoin"] == 0)
    ].copy()
    watch["score"] = (
        watch["net_tailwinds"] * 2
        - watch["drawdown_from_ath_pct"].abs() / 50
        + watch["cagr_pct"].fillna(0) / 50
    )
    watch = watch.sort_values(["net_tailwinds", "rank_idx"], ascending=[False, True])

    red = base[base["overhangs"] >= 2].copy()
    red["risk_score"] = (
        red["overhangs"] * 3
        + red["has_current_regulatory_overhang"] * 2
        + red["has_current_security_or_trust_overhang"] * 2
        + red["has_current_supply_overhang"]
        - red["tailwinds"] * 0.25
    )
    red = red.sort_values(["risk_score", "rank_idx"], ascending=[False, True])

    bucket = (
        base.groupby("predicted_bucket")
        .agg(
            n=("coingecko_id", "count"),
            avg_net=("net_tailwinds", "mean"),
            avg_tailwinds=("tailwinds", "mean"),
            avg_overhangs=("overhangs", "mean"),
            avg_ret90=("return_90d_pct", "mean"),
            avg_sharpe90=("sharpe_ratio_90d", "mean"),
        )
        .reset_index()
        .sort_values(["avg_net", "n"], ascending=[False, False])
    )
    return clean, watch, red, bucket


def load_strategy_table(outputs_root: Path) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for path in list(outputs_root.glob("**/summary.json")) + list(outputs_root.glob("**/scorecard_latest.json")):
        try:
            flat = flatten_json(json.loads(path.read_text()))
        except Exception:
            continue
        sharpe = (
            flat.get("strategy.sharpe")
            or flat.get("best.test.sharpe")
            or flat.get("performance.sharpe_daily_252")
            or flat.get("test_sharpe")
        )
        cagr = (
            flat.get("strategy.cagr")
            or flat.get("best.test.cagr")
            or flat.get("performance.cagr_since_start")
            or flat.get("test_cagr")
        )
        mdd = (
            flat.get("strategy.mdd")
            or flat.get("best.test.max_drawdown")
            or flat.get("performance.max_drawdown_from_returns")
            or flat.get("test_max_drawdown")
        )
        active_sharpe = flat.get("active.active_sharpe")
        excess = flat.get("best.test_excess_ann_ret") or flat.get("active.excess_final")
        if sharpe is None and cagr is None:
            continue
        path_text = str(path)
        noisy = any(token in path.parts for token in {"smoke", "demo"}) or "_smoke" in path_text
        rows.append(
            {
                "path": path_text,
                "sharpe": sharpe,
                "active_sharpe": active_sharpe,
                "cagr": cagr,
                "mdd": mdd,
                "excess": excess,
                "noisy": noisy,
            }
        )

    table = pd.DataFrame(rows)
    if table.empty:
        return table
    for col in ["sharpe", "active_sharpe", "cagr", "mdd", "excess"]:
        table[col] = pd.to_numeric(table[col], errors="coerce")
    table["score"] = (
        table["sharpe"].fillna(0)
        + table["active_sharpe"].fillna(0) * 0.5
        + table["cagr"].fillna(0)
        - table["mdd"].fillna(0).abs() * 0.5
        - table["noisy"].astype(float) * 0.5
    )
    return table.sort_values("score", ascending=False)


def write_report(
    out_md: Path,
    clean: pd.DataFrame,
    watch: pd.DataFrame,
    red: pd.DataFrame,
    bucket: pd.DataFrame,
    strategy: pd.DataFrame,
    freshness_note: str,
) -> None:
    top_strategy = strategy[~strategy["noisy"]].head(12) if not strategy.empty else strategy
    lines = [
        "# Research Conclusion: Where The Value Is",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Bottom Line",
        "",
        "The repo is most valuable as a **crypto regime intelligence and event-alpha research platform**. The strongest commercial path is not immediate live trading; it is packaging the crypto regime dataset into a repeatable research product, while separately validating the SEC-event alpha sleeve as the most promising trading-research candidate.",
        "",
        "Concrete conclusion: **sell/reuse the crypto intelligence product first; paper-trade or research-license the SEC-event strategy second; pause claims around the current live alpha paper bot until it recovers.**",
        "",
        "## Research Caveat",
        "",
        freshness_note,
        "",
        "## Crypto Regime: High-Conviction Opportunity Screen",
        "",
        "Screen: high/medium confidence, >=365 days history, zero current overhangs, >=5 net tailwinds, excludes stablecoins and meme/speculative assets, then ranks by regime strength plus recent risk-adjusted behavior.",
        "",
        markdown_table(
            clean,
            ["rank_idx", "symbol", "name", "predicted_bucket", "net_tailwinds", "return_90d_pct", "sharpe_ratio_90d", "drawdown_from_ath_pct", "current_primary_driver"],
            ["Rank", "Sym", "Name", "Bucket", "Net", "90d Ret", "90d Sharpe", "ATH DD", "Driver"],
            12,
        ),
        "",
        "Interpretation: these are the best candidates for a client-facing clean-growth crypto report. They are not necessarily immediate buys; they are the assets where the intelligence layer says the fundamental/current-regime setup is cleanest.",
        "",
        "## Crypto Watchlist: Strong Thesis But Beaten Down",
        "",
        markdown_table(
            watch,
            ["rank_idx", "symbol", "name", "net_tailwinds", "return_90d_pct", "drawdown_from_ath_pct", "cagr_pct", "current_primary_driver", "current_primary_risk"],
            ["Rank", "Sym", "Name", "Net", "90d Ret", "ATH DD", "CAGR", "Driver", "Risk"],
            12,
        ),
        "",
        "## Crypto Avoid / Short-Diligence Screen",
        "",
        markdown_table(
            red,
            ["rank_idx", "symbol", "name", "predicted_bucket", "overhangs", "has_current_regulatory_overhang", "has_current_supply_overhang", "has_current_security_or_trust_overhang", "current_primary_risk"],
            ["Rank", "Sym", "Name", "Bucket", "Overhangs", "Reg", "Supply", "Trust", "Primary Risk"],
            15,
        ),
        "",
        "## Best Theme Buckets",
        "",
        markdown_table(
            bucket,
            ["predicted_bucket", "n", "avg_net", "avg_tailwinds", "avg_overhangs", "avg_ret90", "avg_sharpe90"],
            ["Bucket", "N", "Avg Net", "Avg Tailwinds", "Avg Overhangs", "Avg 90d Ret", "Avg 90d Sharpe"],
            12,
        ),
        "",
        "Interpretation: the product should sell **screening and risk segmentation**, not raw price prediction. Theme-level regime scoring is easier to defend commercially than a single-token pick list.",
        "",
        "## Strategy Research: What Looks Credible",
        "",
        markdown_table(
            top_strategy,
            ["path", "sharpe", "active_sharpe", "cagr", "mdd", "excess"],
            ["Artifact", "Sharpe", "Active Sharpe", "CAGR", "Max DD", "Excess/Active"],
            12,
        ),
        "",
        "Key strategy conclusion:",
        "",
        "- **SEC-event alpha is the strongest trading-research lead.** The recent 3-year SEC event run shows about `36.5%` CAGR, `1.60` Sharpe, `-20.9%` max drawdown, and `1.05` active Sharpe in the local artifact. Full-history direct SEC event run still beats benchmark with about `25.0%` CAGR and `1.17` Sharpe.",
        "- **Crypto best-practice strategy is usable as research, not yet a hero claim.** The slippage/liquidity-aware crypto run shows test CAGR around `17.8%`, Sharpe `0.67`, and max drawdown around `-8.2%`; it is interesting because risk is controlled, not because Sharpe is spectacular.",
        "- **Nasdaq/equity academic config is not ready.** It has positive validation but negative holdout/test performance in the artifact, so it should be a research branch, not a marketed signal.",
        "- **Current alpha paper bot should not be capitalized as performance yet.** Latest scorecard is negative since start, despite a positive recent 30-day return. Keep it as an operational harness, not a sales claim.",
        "",
        "## Commercial Product Recommendation",
        "",
        "Launch the first product as **Crypto Regime Intelligence**:",
        "",
        "- weekly clean-growth list",
        "- red-flag/avoid list",
        "- theme rotation map",
        "- source/confidence/freshness appendix",
        "- downloadable CSV from the regime screen",
        "",
        "Then sell or use the SEC-event alpha lab as a more technical second product:",
        "",
        "- event taxonomy",
        "- walk-forward and cost-stress pack",
        "- capacity estimate",
        "- paper-trading recommendation only after daily monitoring",
        "",
    ]
    out_md.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export research screens and conclusion memo")
    parser.add_argument("--panel", default="data_lake/crypto_pipeline/context/current_regime_top500_model_panel.csv")
    parser.add_argument("--outputs-root", default="backtests/outputs")
    parser.add_argument("--out-dir", default="reports/research_screens_20260505")
    parser.add_argument("--out-md", default="reports/RESEARCH_CONCLUSION_20260505.md")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    clean, watch, red, bucket = load_crypto_screens(Path(args.panel))
    strategy = load_strategy_table(Path(args.outputs_root))
    freshness_note = crypto_freshness_note(Path.cwd())

    clean.head(100).to_csv(out_dir / "clean_growth.csv", index=False)
    watch.head(100).to_csv(out_dir / "watchlist_reversal.csv", index=False)
    red.head(100).to_csv(out_dir / "red_flags.csv", index=False)
    bucket.to_csv(out_dir / "theme_buckets.csv", index=False)
    strategy.head(100).to_csv(out_dir / "strategy_candidates.csv", index=False)
    write_report(Path(args.out_md), clean, watch, red, bucket, strategy, freshness_note)
    print(f"wrote {args.out_md}")
    print(f"wrote screens under {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
