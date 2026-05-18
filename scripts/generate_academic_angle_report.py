#!/usr/bin/env python3
"""
Generate a practical "academic angle" report from Cite-Agent topic snapshots
plus local ablation results.

This is meant to answer: "Is there still an academic angle worth pursuing?"
in a way that maps directly to actions in this repo.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text())


def _safe_list(x: Any) -> List[Any]:
    return list(x) if isinstance(x, list) else []


def _topic_card(topic: Dict[str, Any]) -> str:
    state = topic.get("state") or {}
    key_findings = _safe_list(state.get("key_findings"))
    last_papers = _safe_list(state.get("last_papers"))

    lines: List[str] = []
    lines.append(f"### {topic.get('name','')}")
    lines.append(f"- Query: `{topic.get('query','')}`")
    if topic.get("last_updated"):
        lines.append(f"- Last updated: `{topic.get('last_updated')}`")
    lines.append(f"- Key findings captured: `{len(key_findings)}`; papers in last batch: `{len(last_papers)}`")

    if key_findings:
        lines.append("- Notable findings (sample):")
        for f in key_findings[:6]:
            lines.append(f"  - {str(f).strip()}")

    if last_papers:
        lines.append("- Papers (this update, top 6):")
        for p in last_papers[:6]:
            title = (p.get("title") or "Untitled").strip()
            year = p.get("year") or "?"
            url = p.get("url") or ""
            src = p.get("source") or "unknown"
            if url:
                lines.append(f"  - {title} ({year}) [{src}] — {url}")
            else:
                lines.append(f"  - {title} ({year}) [{src}]")

    return "\n".join(lines)


def _load_topics(research_dir: Path) -> List[Dict[str, Any]]:
    topics: List[Dict[str, Any]] = []
    for p in sorted(research_dir.glob("*.json")):
        if p.name.startswith("_"):
            continue
        try:
            obj = _read_json(p)
            if not str(obj.get("name") or "").strip():
                continue
            topics.append(obj)
        except Exception:
            continue
    return topics


def _summarize_ablation(ablation_path: Optional[Path]) -> str:
    if not ablation_path or not ablation_path.exists():
        return "No ablation results found."

    obj = _read_json(ablation_path)
    base = (obj.get("baseline") or {}).get("strategy") or {}
    variants = obj.get("variants") or {}

    rows: List[Tuple[str, float, float, float]] = []
    for name, v in variants.items():
        s = (v.get("summary") or {}).get("strategy") or {}
        rows.append(
            (
                name,
                float(s.get("cagr", 0.0)),
                float(s.get("sharpe", 0.0)),
                float(s.get("mdd", 0.0)),
            )
        )
    rows.sort(key=lambda x: x[2], reverse=True)

    lines: List[str] = []
    lines.append("### What our repo already tested (ablation)")
    lines.append(
        f"- Baseline: CAGR `{base.get('cagr')}`, Sharpe `{base.get('sharpe')}`, MDD `{base.get('mdd')}`"
    )
    if rows:
        lines.append("- Variants (sorted by Sharpe):")
        for name, cagr, sharpe, mdd in rows:
            lines.append(f"  - `{name}`: CAGR `{cagr:.3f}`, Sharpe `{sharpe:.3f}`, MDD `{mdd:.3f}`")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate academic angle report.")
    ap.add_argument("--research-dir", type=Path, default=Path("Sharpe-Renaissance/data_lake/research_context"))
    ap.add_argument(
        "--ablation-json",
        type=Path,
        default=Path("Sharpe-Renaissance/backtests/outputs/spy_beater/research_findings_ablation_20260115/comparison.json"),
    )
    ap.add_argument("--out", type=Path, default=Path("Sharpe-Renaissance/reports/academic_angle_report.md"))
    args = ap.parse_args()

    topics = _load_topics(args.research_dir)
    timestamp = datetime.now(timezone.utc).isoformat()

    lines: List[str] = []
    lines.append("# Academic Angles: Practical Exploration")
    lines.append(f"_Generated: `{timestamp}`_")
    lines.append("")
    lines.append("## Bottom line")
    lines.append(
        "- Academic research is still useful here, but mainly as **constraints + hypothesis generation** rather than a direct price signal."
    )
    lines.append(
        "- The winning workflow is: **convert findings → make a concrete intervention → ablate/backtest → keep only what survives**."
    )
    lines.append("")
    lines.append(_summarize_ablation(args.ablation_json))
    lines.append("")
    lines.append("## Current academic context snapshots")
    if not topics:
        lines.append("- No topic snapshots found.")
    else:
        for t in topics:
            lines.append(_topic_card(t))
            lines.append("")

    lines.append("## What looks worth pursuing next (actionable in this repo)")
    lines.append("- Regime model horizon/refit cadence (we already saw it can improve Sharpe but may worsen tail risk).")
    lines.append("- Strict, explicit cost/turnover realism (hurts backtests, but prevents fake edge; use as a gate).")
    lines.append("- Trend + absolute momentum constraints (often stabilizes selection; currently neutral in our quick ablation).")
    lines.append("- Volatility-managed leverage (requires implementing a vol-managed allocation variant for the leveraged sleeve).")
    lines.append("- Event/news signals (requires new data plumbing; yfinance headlines is insufficient for robust studies).")
    lines.append("")
    lines.append("## What’s probably not worth time (given current data)")
    lines.append("- Intraday microstructure alpha without true intraday data + realistic fills/impact.")
    lines.append("- Most 'generic ML' claims unless tied to finance-specific labels/features and evaluated OOS with costs.")
    lines.append("")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines).rstrip() + "\n")
    print(f"✅ wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
