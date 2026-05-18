#!/usr/bin/env python3
"""Build graph/map files from OpenSea token metadata sidecars."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


COLLECTION_CONTEXT = {
    "opensea_zip_azuki": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_bayc": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH", "APE"]},
    "opensea_zip_clone_x": {"category": "PFP / fashion", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_cool_cats": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_cryptopunks": {"category": "PFP / historical", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_cryptoskulls": {"category": "PFP / historical", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_doodles": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_mayc": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH", "APE"]},
    "opensea_zip_meebits": {"category": "3D avatar", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_moonbirds": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_mooncats": {"category": "PFP / historical", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_pudgy_penguins": {"category": "PFP / consumer brand", "chain": "Ethereum", "related_assets": ["ETH", "PENGU"]},
    "opensea_zip_supducks": {"category": "PFP", "chain": "Ethereum", "related_assets": ["ETH"]},
    "opensea_zip_world_of_women": {"category": "PFP / art", "chain": "Ethereum", "related_assets": ["ETH"]},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sidecar-root", required=True, help="Metadata sidecar folder.")
    parser.add_argument("--out-dir", default="", help="Output directory. Defaults to sidecar-root/map.")
    parser.add_argument("--max-token-nodes-per-collection", type=int, default=50)
    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def add_node(nodes: dict[str, dict[str, Any]], node_id: str, label: str, node_type: str, **attrs: Any) -> None:
    if node_id not in nodes:
        nodes[node_id] = {"id": node_id, "label": label, "type": node_type, **attrs}
    else:
        nodes[node_id].update({k: v for k, v in attrs.items() if v not in ("", None)})


def add_edge(edges: list[dict[str, Any]], source: str, target: str, relation: str, **attrs: Any) -> None:
    edges.append({"source": source, "target": target, "relation": relation, **attrs})


def safe_id(*parts: Any) -> str:
    text = "::".join(str(part).strip() for part in parts)
    return "".join(ch if ch.isalnum() or ch in "-_:.#" else "_" for ch in text)


def main() -> int:
    args = parse_args()
    sidecar_root = Path(args.sidecar_root).resolve()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else sidecar_root / "map"
    token_rows = read_csv(sidecar_root / "token_metadata_index.csv")
    trait_rows = read_csv(sidecar_root / "traits_long.csv")

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    add_node(nodes, "chain:Ethereum", "Ethereum", "chain")
    for symbol in ["ETH", "APE", "PENGU"]:
        add_node(nodes, f"asset:{symbol}", symbol, "crypto_asset")

    collection_counts = Counter(row["public_folder"] for row in token_rows)
    for public_folder, count in sorted(collection_counts.items()):
        context = COLLECTION_CONTEXT.get(public_folder, {"category": "", "chain": "Ethereum", "related_assets": ["ETH"]})
        collection_label = next((row["collection"] for row in token_rows if row["public_folder"] == public_folder), public_folder)
        collection_id = f"collection:{public_folder}"
        add_node(
            nodes,
            collection_id,
            collection_label,
            "nft_collection",
            public_folder=public_folder,
            category=context.get("category", ""),
            sampled_tokens=count,
        )
        add_edge(edges, collection_id, "chain:Ethereum", "on_chain")
        for symbol in context.get("related_assets", []):
            add_edge(edges, collection_id, f"asset:{symbol}", "related_crypto_asset")
        if context.get("category"):
            category_id = safe_id("category", context["category"])
            add_node(nodes, category_id, context["category"], "category")
            add_edge(edges, collection_id, category_id, "has_category")

    token_seen_by_collection: Counter[str] = Counter()
    token_included: set[tuple[str, str]] = set()
    for row in token_rows:
        public_folder = row["public_folder"]
        token_id = row["token_id"]
        if token_seen_by_collection[public_folder] >= args.max_token_nodes_per_collection:
            continue
        token_seen_by_collection[public_folder] += 1
        token_included.add((public_folder, token_id))
        token_node = safe_id("token", public_folder, token_id)
        add_node(
            nodes,
            token_node,
            f"{public_folder} #{token_id}",
            "nft_token",
            public_folder=public_folder,
            token_id=token_id,
            name=row.get("name", ""),
            attribute_count=row.get("attribute_count", ""),
        )
        add_edge(edges, f"collection:{public_folder}", token_node, "has_sample_token")

    trait_counts = Counter(
        (row["public_folder"], row["trait_type"], row["value"])
        for row in trait_rows
        if row.get("trait_type") and row.get("value")
    )
    trait_type_counts = Counter(
        (row["public_folder"], row["trait_type"])
        for row in trait_rows
        if row.get("trait_type")
    )

    for (public_folder, trait_type), count in sorted(trait_type_counts.items()):
        trait_type_id = safe_id("trait_type", public_folder, trait_type)
        add_node(nodes, trait_type_id, trait_type, "trait_type", public_folder=public_folder, count=count)
        add_edge(edges, f"collection:{public_folder}", trait_type_id, "has_trait_type", count=count)

    for (public_folder, trait_type, value), count in sorted(trait_counts.items()):
        value_id = safe_id("trait_value", public_folder, trait_type, value)
        add_node(nodes, value_id, str(value), "trait_value", public_folder=public_folder, trait_type=trait_type, count=count)
        add_edge(edges, safe_id("trait_type", public_folder, trait_type), value_id, "has_trait_value", count=count)

    for row in trait_rows:
        public_folder = row["public_folder"]
        token_id = row["token_id"]
        trait_type = row.get("trait_type", "")
        value = row.get("value", "")
        if not trait_type or not value or (public_folder, token_id) not in token_included:
            continue
        add_edge(
            edges,
            safe_id("token", public_folder, token_id),
            safe_id("trait_value", public_folder, trait_type, value),
            "has_trait",
        )

    trait_summary = [
        {
            "public_folder": public_folder,
            "trait_type": trait_type,
            "value": value,
            "count": count,
        }
        for (public_folder, trait_type, value), count in sorted(trait_counts.items())
    ]
    trait_matrix: dict[str, dict[str, Any]] = defaultdict(dict)
    for (public_folder, trait_type), count in sorted(trait_type_counts.items()):
        trait_matrix[public_folder]["public_folder"] = public_folder
        trait_matrix[public_folder][trait_type] = count

    node_rows = sorted(nodes.values(), key=lambda row: (row["type"], row["id"]))
    edge_rows = edges
    graph = {"nodes": node_rows, "edges": edge_rows}

    write_csv(out_dir / "graph_nodes.csv", node_rows, ["id", "label", "type", "public_folder", "category", "sampled_tokens", "token_id", "name", "attribute_count", "trait_type", "count"])
    write_csv(out_dir / "graph_edges.csv", edge_rows, ["source", "target", "relation", "count"])
    write_csv(out_dir / "trait_summary.csv", trait_summary, ["public_folder", "trait_type", "value", "count"])
    matrix_fields = ["public_folder"] + sorted({row["trait_type"] for row in trait_rows if row.get("trait_type")})
    write_csv(out_dir / "collection_trait_matrix.csv", list(trait_matrix.values()), matrix_fields)
    (out_dir / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    readme = [
        "# OpenSea Metadata Map",
        "",
        "Graph/map files generated from the metadata sidecar pilot.",
        "",
        "- `graph_nodes.csv`: collection, chain, crypto asset, token, trait type, and trait value nodes.",
        "- `graph_edges.csv`: relationship edges for graph visualization.",
        "- `graph.json`: JSON version of the graph.",
        "- `trait_summary.csv`: trait value frequencies by collection.",
        "- `collection_trait_matrix.csv`: collection-by-trait-type coverage matrix.",
        "",
        f"Nodes: {len(node_rows)}",
        f"Edges: {len(edge_rows)}",
        f"Token rows used: {len(token_rows)}",
        f"Trait rows used: {len(trait_rows)}",
    ]
    (out_dir / "README.md").write_text("\n".join(readme) + "\n", encoding="utf-8")
    print(f"wrote {out_dir} nodes={len(node_rows)} edges={len(edge_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
