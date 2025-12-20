#!/usr/bin/env python3
"""
Run a simple supply-chain contagion simulation over the Refinitiv graph.
Seeds a ticker (default NVDA) with a shock and propagates it.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_tools.feature_store import DEFAULT_SOURCE, load_supply_chain_graph
from data_tools.contagion import propagate_shock, top_shock_targets


def main():
    sc_path = DEFAULT_SOURCE / "DATA_4_SupplyChain_Network.csv"
    try:
        g = load_supply_chain_graph(sc_path)
    except Exception as exc:
        print(f"⚠️ Could not load supply chain graph: {exc}")
        return 1

    seed = "NVDA.O"
    scores = propagate_shock(g, seeds=[seed], initial_shock=1.0, decay=0.6, steps=3)
    top = top_shock_targets(scores, k=10)
    print(f"✅ Shock propagated from {seed}. Top impacted nodes:")
    for n, s in top:
        print(f"  {n}: {s:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
