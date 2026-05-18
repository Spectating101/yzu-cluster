#!/usr/bin/env python3
"""
Refresh a curated set of finance/trading academic topics via Cite-Agent and
persist snapshots into Sharpe-Renaissance.

This is the "serious exploration" plumbing: it creates/updates topics, then
writes machine-readable context files you can version alongside backtests.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

_SR_ROOT = Path(__file__).resolve().parents[1]
if str(_SR_ROOT) not in sys.path:
    sys.path.insert(0, str(_SR_ROOT))

from research.cite_agent_client import CiteAgentClient  # noqa: E402


@dataclass(frozen=True)
class TopicSpec:
    name: str
    query: str
    description: str


TOPICS: List[TopicSpec] = [
    TopicSpec(
        name="ML_Return_Predictability",
        query="empirical asset pricing via machine learning out-of-sample return prediction cross-section characteristics",
        description="ML in return prediction, OOS, pitfalls, regularization",
    ),
    TopicSpec(
        name="Factor_Zoo_Discovery_And_Culling",
        query="factor zoo false discoveries multiple testing out-of-sample validation asset pricing",
        description="Factor zoo, multiple testing, validation protocols",
    ),
    TopicSpec(
        name="Volatility_Managed_Strategies",
        query="volatility managed portfolios volatility targeting managed volatility leverage constraints empirical",
        description="Volatility-managed strategies and implementation constraints",
    ),
    TopicSpec(
        name="TimeSeries_Momentum_Trend",
        query="time-series momentum trend following equity index futures managed futures evidence crash protection",
        description="Trend / time-series momentum and crisis behavior",
    ),
    TopicSpec(
        name="News_Sentiment_Event_Alpha",
        query="news sentiment event study stock returns drift post earnings announcement drift attention limited investor",
        description="News/sentiment/event studies, post-event drift, attention effects",
    ),
    TopicSpec(
        name="Liquidity_And_Transaction_Costs",
        query="transaction costs market impact liquidity turnover implementation shortfall portfolio optimization",
        description="Slippage/impact/capacity and turnover-aware implementation",
    ),
    TopicSpec(
        name="Risk_Managed_Portfolios",
        query="risk parity volatility targeting drawdown control managed risk portfolios turnover costs",
        description="Risk overlays + drawdown management realism",
    ),
    TopicSpec(
        name="Options_Information_And_Hedges",
        query="variance risk premium option-implied information equity returns protective put collar tail risk hedging",
        description="Options-implied signals and hedging overlays",
    ),
]


def _wait_http_ok(url: str, *, timeout_s: float = 20.0, interval_s: float = 0.5) -> None:
    deadline = time.time() + timeout_s
    last_err: str = ""
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5.0) as resp:
                if 200 <= int(resp.status) < 300:
                    return
        except Exception as e:
            last_err = str(e)
        time.sleep(interval_s)
    raise RuntimeError(f"Timed out waiting for {url} (last error: {last_err})")


def _write_snapshot(out_dir: Path, *, name: str, topic: Any, cite_agent_url: str) -> Path:
    payload = {
        "name": topic.name,
        "query": topic.query,
        "description": topic.description,
        "last_updated": topic.last_updated,
        "state": topic.state,
        "source": {"cite_agent_url": cite_agent_url},
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description="Refresh curated academic angle topics via Cite-Agent.")
    ap.add_argument("--cite-agent-url", default="http://127.0.0.1:8001")
    ap.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/data_lake/research_context"))
    ap.add_argument("--create-missing", action="store_true")
    ap.add_argument("--update", action="store_true", help="Trigger server-side topic updates before snapshotting.")
    ap.add_argument("--topics", nargs="*", default=[], help="Subset of topic names (defaults to curated set).")
    args = ap.parse_args()

    client = CiteAgentClient(args.cite_agent_url)

    wanted = set(args.topics) if args.topics else {t.name for t in TOPICS}
    curated = [t for t in TOPICS if t.name in wanted]
    if not curated:
        raise SystemExit("No matching topics requested.")

    # If we're going to update, wait for the local stack to be ready.
    # Cite-Agent depends on the archive backend.
    if args.update:
        _wait_http_ok("http://127.0.0.1:8000/api/health", timeout_s=30.0)
        _wait_http_ok(f"{args.cite_agent_url.rstrip('/')}/api/v1/topics", timeout_s=30.0)

    if args.create_missing:
        existing = {t.name for t in client.list_topics()}
        for spec in curated:
            if spec.name in existing:
                continue
            client.create_topic(name=spec.name, query=spec.query, description=spec.description)

    if args.update:
        update_log: Dict[str, Any] = {"updated": {}, "errors": {}}
        for spec in curated:
            # Topic update can fail transiently if upstream sources hiccup.
            # Retry a few times to avoid "stack still warming up" flakiness.
            last_err = None
            for _ in range(5):
                try:
                    update_log["updated"][spec.name] = client.update_topic(spec.name)
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    time.sleep(1.0)
            if last_err is not None:
                # Keep going; we still snapshot whatever state exists so the report
                # can reflect partial refresh rather than failing hard.
                update_log["errors"][spec.name] = str(last_err)
        (args.out_dir / "_refresh_log.json").write_text(json.dumps(update_log, indent=2) + "\n")

    for spec in curated:
        topic = client.get_topic(spec.name)
        path = _write_snapshot(args.out_dir, name=spec.name, topic=topic, cite_agent_url=args.cite_agent_url)
        print(f"✅ wrote {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
