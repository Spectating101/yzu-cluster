"""
Simple supply-chain contagion simulation using the Refinitiv graph.

This is a lightweight, deterministic propagation model suitable for mock/demo
use. It propagates an initial shock score from source nodes to neighbors over
K steps with decay.
"""
from __future__ import annotations

from typing import Dict, Iterable, Tuple

try:
    import networkx as nx
except ImportError:  # pragma: no cover - optional
    nx = None


def propagate_shock(
    g,
    seeds: Iterable[str],
    initial_shock: float = 1.0,
    decay: float = 0.5,
    steps: int = 3,
) -> Dict[str, float]:
    """
    Propagate shock scores through a directed supply-chain graph.

    Args:
        g: networkx.DiGraph
        seeds: iterable of node names to initialize with initial_shock
        initial_shock: starting shock value
        decay: multiplicative decay per hop
        steps: number of propagation steps

    Returns:
        dict of node -> accumulated shock score
    """
    if nx is None:
        raise ImportError("networkx required for contagion simulation")

    scores: Dict[str, float] = {s: initial_shock for s in seeds if s in g}

    frontier: Dict[str, float] = scores.copy()
    for _ in range(steps):
        new_frontier: Dict[str, float] = {}
        for node, shock in frontier.items():
            for _, nbr, data in g.out_edges(node, data=True):
                propagated = shock * decay
                new_frontier[nbr] = new_frontier.get(nbr, 0.0) + propagated
        # accumulate
        for n, val in new_frontier.items():
            scores[n] = scores.get(n, 0.0) + val
        frontier = new_frontier

    return scores


def top_shock_targets(scores: Dict[str, float], k: int = 10) -> list[Tuple[str, float]]:
    """Return top-k nodes by shock score."""
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)[:k]
