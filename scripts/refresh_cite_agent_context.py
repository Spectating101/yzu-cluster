#!/usr/bin/env python3
"""
Pull 'academic consensus' topic snapshots from a running Cite-Agent API server and
write them into Sharpe-Renaissance for traceability.

This script does NOT change trading logic; it produces a machine-readable context
artifact you can version/control alongside your backtests.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List

_SR_ROOT = Path(__file__).resolve().parents[1]
if str(_SR_ROOT) not in sys.path:
    sys.path.insert(0, str(_SR_ROOT))

from research.cite_agent_client import CiteAgentClient


DEFAULT_TOPICS = [
    # Macro "rules of the game"
    ("Risk_Managed_Portfolios", "volatility targeting drawdown control risk parity turnover costs", "Risk overlays + implementation realism"),
    # Crypto-relevant factor lens
    ("Crypto_CrossSectional_Momentum", "cross-sectional momentum crypto evidence transaction costs", "Academic evidence for cross-sectional momentum in crypto"),
    ("Market_Impact_Slippage", "price impact slippage participation rate square root model", "Market impact / slippage modeling best practices"),
]


def main() -> int:
    p = argparse.ArgumentParser(description="Refresh Cite-Agent topic snapshots into Sharpe-Renaissance.")
    p.add_argument("--cite-agent-url", default="http://127.0.0.1:8001")
    p.add_argument("--out-dir", type=Path, default=Path("Sharpe-Renaissance/data_lake/research_context"))
    p.add_argument("--create-missing", action="store_true", help="Create topics if they don't exist yet")
    p.add_argument("--topics", nargs="*", default=[], help="Topic names to fetch (defaults to a small curated set)")
    args = p.parse_args()

    client = CiteAgentClient(args.cite_agent_url)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    topics: List[str] = list(args.topics)
    if not topics:
        topics = [t[0] for t in DEFAULT_TOPICS]

    if args.create_missing:
        existing = {t.name for t in client.list_topics()}
        for name, query, desc in DEFAULT_TOPICS:
            if name in existing:
                continue
            client.create_topic(name=name, query=query, description=desc)

    for name in topics:
        topic = client.get_topic(name)
        payload = {
            "name": topic.name,
            "query": topic.query,
            "description": topic.description,
            "last_updated": topic.last_updated,
            "state": topic.state,
            "source": {"cite_agent_url": args.cite_agent_url},
        }
        (args.out_dir / f"{name}.json").write_text(json.dumps(payload, indent=2))
        print(f"✅ wrote {args.out_dir / f'{name}.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
