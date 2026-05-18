#!/usr/bin/env python3
"""Compute reusable signal stats from news event panels."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_EVENTS = Path("data_lake/crypto_pipeline/news_context/news_events.csv")
DEFAULT_REPORT = Path("reports/CRYPTO_NEWS_EVENT_STUDY.md")


def _to_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def _t_stat(values: pd.Series) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    v = values.to_numpy(dtype=float)
    mean = float(np.mean(v))
    std = float(np.std(v, ddof=1))
    if std == 0.0:
        return 0.0
    return mean / (std / np.sqrt(n))


def _group_stats(df: pd.DataFrame, label: str, dims: list[str], horizons: list[int]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    if df.empty:
        return pd.DataFrame()
    for key, group in df.groupby(dims):
        if isinstance(key, tuple):
            keys = key
        else:
            keys = (key,)
        base = {col: val for col, val in zip(dims, keys)}
        for horizon in horizons:
            col = f"fwd_{horizon}d_ret"
            s = pd.to_numeric(group[col], errors="coerce").dropna()
            if s.empty:
                row = {
                    "group": label,
                    **base,
                    "horizon": horizon,
                    "n": 0,
                    "mean_return": 0.0,
                    "median_return": 0.0,
                    "win_rate": 0.0,
                    "t_stat": 0.0,
                }
            else:
                row = {
                    "group": label,
                    **base,
                    "horizon": horizon,
                    "n": int(len(s)),
                    "mean_return": float(s.mean()),
                    "median_return": float(s.median()),
                    "win_rate": float((s > 0).mean()),
                    "t_stat": float(_t_stat(s)),
                }
            rows.append(row)
    return pd.DataFrame(rows)


def run_study(events_path: Path) -> dict[str, pd.DataFrame]:
    try:
        events = pd.read_csv(events_path)
    except Exception:
        events = pd.DataFrame()
    if events.empty:
        return {
            "events": events,
            "factor": pd.DataFrame(),
            "direction": pd.DataFrame(),
            "factor_direction": pd.DataFrame(),
            "coin": pd.DataFrame(),
            "source_quality": pd.DataFrame(),
        }

    events["published_at"] = _to_datetime(events.get("published_at"))
    events = events.dropna(subset=["published_at"])
    events["date"] = events["published_at"].dt.date.astype(str)

    def _horizon(col: str) -> int:
        m = re.search(r"(\d+)", col)
        return int(m.group(1)) if m else 0

    horizon_cols = sorted(
        [c for c in events.columns if c.startswith("fwd_") and c.endswith("_ret")],
        key=_horizon,
    )
    horizons = [_horizon(c) for c in horizon_cols]

    events["factor"] = events.get("factor", "general_market").fillna("general_market")
    events["direction"] = events.get("direction", "mixed_or_unclear").fillna("mixed_or_unclear")
    events["source_quality"] = events.get("source_quality", "unknown").fillna("unknown")
    events["coingecko_id"] = events.get("coingecko_id", "unknown").fillna("unknown")

    by_factor = _group_stats(events, "factor", ["factor"], horizons)
    by_direction = _group_stats(events, "direction", ["direction"], horizons)
    by_factor_direction = _group_stats(events, "factor_direction", ["factor", "direction"], horizons)
    by_coin = _group_stats(events, "coin", ["coingecko_id"], horizons)
    by_source = _group_stats(events, "source_quality", ["source_quality"], horizons)

    return {
        "events": events,
        "horizon_cols": pd.DataFrame({"horizon_col": horizon_cols}),
        "factor": by_factor,
        "direction": by_direction,
        "factor_direction": by_factor_direction,
        "coin": by_coin,
        "source_quality": by_source,
    }


def write_outputs(
    result: dict[str, pd.DataFrame], report_path: Path, out_dir: Path, events_path: Path
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for key in ("factor", "direction", "factor_direction", "coin", "source_quality"):
        if not result[key].empty:
            result[key].sort_values(["horizon", "n", "mean_return"], ascending=[True, False, False], inplace=True)

    (out_dir / "factor_summary.csv").write_text(result["factor"].to_csv(index=False))
    (out_dir / "direction_summary.csv").write_text(result["direction"].to_csv(index=False))
    (out_dir / "factor_direction_summary.csv").write_text(result["factor_direction"].to_csv(index=False))
    (out_dir / "coin_summary.csv").write_text(result["coin"].to_csv(index=False))
    (out_dir / "source_quality_summary.csv").write_text(result["source_quality"].to_csv(index=False))
    (out_dir / "event_study_events.csv").write_text(result["events"].to_csv(index=False))

    total = len(result["events"])
    lines = [
        "# Crypto News Event Study",
        "",
        f"Generated: {datetime.now(timezone.utc).replace(microsecond=0).isoformat()}",
        f"Input events: {events_path}",
        f"Event rows: {total}",
        "",
        "## Top signal combos",
        "",
    ]

    for title, key in (
        ("By factor", "factor"),
        ("By direction", "direction"),
        ("By factor + direction", "factor_direction"),
        ("By coin", "coin"),
        ("By source quality", "source_quality"),
    ):
        lines.append(f"### {title}")
        lines.append("")
        df = result[key]
        if df.empty:
            lines.append("- no data")
        else:
            top = df.sort_values(["mean_return", "n"], ascending=[False, False]).head(20)
            lines.append(top.to_csv(index=False))
        lines.append("")

    lines.append("## Files")
    lines.append("")
    lines.append(f"- `{out_dir / 'factor_summary.csv'}`")
    lines.append(f"- `{out_dir / 'direction_summary.csv'}`")
    lines.append(f"- `{out_dir / 'factor_direction_summary.csv'}`")
    lines.append(f"- `{out_dir / 'coin_summary.csv'}`")
    lines.append(f"- `{out_dir / 'source_quality_summary.csv'}`")
    lines.append(f"- `{out_dir / 'event_study_events.csv'}`")
    report_path.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run news event study summaries.")
    parser.add_argument("--events", type=Path, default=DEFAULT_EVENTS)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data_lake/crypto_pipeline/news_context/event_study"),
    )
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()

    result = run_study(args.events)
    write_outputs(result, args.report, args.out_dir, args.events)
    print(f"wrote {args.out_dir / 'factor_summary.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
