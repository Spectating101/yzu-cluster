#!/usr/bin/env python3
"""Build a conservative asset catalog for research/data capitalization.

The script inspects metadata only by default and never deletes or rewrites data.
It is intended to make valuable datasets visible and separate them from caches,
generated bundles, and reproducible build output.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sqlite3
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_ROOTS = [
    "data_lake",
    "deliverables",
    "From-refinitiv",
    "backtests/outputs",
    "reports",
    "Sharpe-Renaissance/output",
]

VALUABLE_EXTENSIONS = {
    ".csv",
    ".parquet",
    ".json",
    ".jsonl",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".xlsx",
    ".zip",
    ".gz",
    ".md",
}

DATA_EXTENSIONS = {
    ".csv",
    ".parquet",
    ".json",
    ".jsonl",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".xlsx",
}

CACHE_MARKERS = {
    "__pycache__",
    ".pytest_cache",
    "target",
    "logs",
    ".egg-info",
    ".dist-info",
}


@dataclass
class Asset:
    path: str
    size_bytes: int
    modified_utc: str
    extension: str
    asset_class: str
    role: str
    recommendation: str
    risk_note: str
    tags: list[str] = field(default_factory=list)
    sha256: str | None = None
    sqlite_tables: dict[str, int | None] | None = None
    columns_sample: list[str] | None = None


def utc_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def human_size(num: int) -> str:
    value = float(num)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024.0 or unit == "TB":
            return f"{value:.1f}{unit}"
        value /= 1024.0
    return f"{value:.1f}TB"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def path_has_marker(path: Path, markers: set[str]) -> bool:
    parts = set(path.parts)
    return any(marker in parts for marker in markers)


def classify(path: Path, size: int) -> tuple[str, str, str, str, list[str]]:
    p = path.as_posix().lower()
    ext = path.suffix.lower()
    tags: list[str] = []

    if path_has_marker(path, CACHE_MARKERS) or ext in {".pyc", ".pyo", ".log"}:
        return (
            "cache/build",
            "reproducible clutter",
            "ignore/remove",
            "Safe to regenerate; keep out of git.",
            ["cache"],
        )

    if "coingecko" in p or "crypto_pipeline" in p or "professor_crypto" in p:
        tags.append("crypto")
    if "refinitiv" in p or path.parts[:1] == ("From-refinitiv",):
        tags.append("paid/refinitiv")
    if "sec" in p:
        tags.append("sec-events")
    if "reddit" in p or "sentiment" in p:
        tags.append("alt-data")
    if "yfinance" in p:
        tags.append("market-panel")
    if "spy_beater" in p or "dynamic_regime" in p:
        tags.append("strategy")
    if "deliverables" in path.parts:
        tags.append("handoff")
    if "backtests" in path.parts:
        tags.append("research-result")

    if ext in {".sqlite", ".sqlite3", ".db"}:
        return (
            "database",
            "canonical data store" if "data_lake" in path.parts else "archive/deliverable database",
            "protect/catalog",
            "High value if sourced from paid/procured collection; do not delete without manifest decision.",
            tags + ["database"],
        )

    if ext in DATA_EXTENSIONS:
        role = "analysis panel"
        if "backtests" in path.parts:
            role = "research output"
        elif "deliverables" in path.parts:
            role = "deliverable payload"
        elif "reports" in path.parts:
            role = "report source"
        return (
            "dataset",
            role,
            "protect/catalog" if size > 1_000_000 or tags else "keep if referenced",
            "Potentially valuable data/research artifact.",
            tags,
        )

    if ext in {".zip", ".gz", ".tar"} or path.name.endswith(".tar.gz"):
        return (
            "archive",
            "handoff/archive bundle",
            "archive/dedupe",
            "Keep one canonical copy or externalize; verify before removal.",
            tags + ["archive"],
        )

    if ext == ".md":
        return (
            "documentation",
            "research/documentation",
            "keep",
            "Human-readable context and provenance.",
            tags,
        )

    return ("other", "unclassified", "inspect", "Needs manual review before cleanup.", tags)


def sqlite_table_counts(path: Path, max_tables: int = 24) -> dict[str, int | None]:
    out: dict[str, int | None] = {}
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        try:
            names = [
                row[0]
                for row in con.execute(
                    "select name from sqlite_master where type='table' order by name"
                ).fetchmany(max_tables)
            ]
            for name in names:
                try:
                    out[name] = int(con.execute(f'select count(*) from "{name}"').fetchone()[0])
                except Exception:
                    out[name] = None
        finally:
            con.close()
    except Exception:
        return {}
    return out


def csv_columns(path: Path, max_cols: int = 24) -> list[str]:
    try:
        with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            return [str(x) for x in header[:max_cols]]
    except Exception:
        return []


def iter_files(root: Path, roots: Iterable[str]) -> Iterable[Path]:
    for rel in roots:
        base = root / rel
        if not base.exists():
            continue
        if base.is_file():
            yield base
            continue
        for current, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in {".git", "__pycache__", "target"}]
            for name in files:
                yield Path(current) / name


def build_catalog(args: argparse.Namespace) -> dict:
    repo = Path(args.repo_root).resolve()
    assets: list[Asset] = []
    duplicate_candidates: dict[tuple[int, str], list[Path]] = defaultdict(list)

    for path in iter_files(repo, args.roots):
        if not path.is_file():
            continue
        rel = path.relative_to(repo).as_posix()
        ext = path.suffix.lower()
        if ext not in VALUABLE_EXTENSIONS and path.stat().st_size > args.min_size:
            pass
        elif ext not in VALUABLE_EXTENSIONS:
            continue

        size = path.stat().st_size
        asset_class, role, recommendation, risk_note, tags = classify(path.relative_to(repo), size)
        asset = Asset(
            path=rel,
            size_bytes=size,
            modified_utc=utc_mtime(path),
            extension=ext or "[none]",
            asset_class=asset_class,
            role=role,
            recommendation=recommendation,
            risk_note=risk_note,
            tags=tags,
        )

        if ext in {".sqlite", ".sqlite3", ".db"}:
            asset.sqlite_tables = sqlite_table_counts(path)
        elif ext == ".csv" and size <= args.csv_header_max_bytes:
            asset.columns_sample = csv_columns(path)

        if size >= args.hash_min_bytes:
            duplicate_candidates[(size, path.name)].append(path)
        assets.append(asset)

    for candidates in duplicate_candidates.values():
        if len(candidates) < 2:
            continue
        for path in candidates:
            rel = path.relative_to(repo).as_posix()
            digest = sha256_file(path)
            for asset in assets:
                if asset.path == rel:
                    asset.sha256 = digest
                    break

    assets.sort(key=lambda item: item.size_bytes, reverse=True)
    by_class = Counter(asset.asset_class for asset in assets)
    by_reco = Counter(asset.recommendation for asset in assets)
    by_tag = Counter(tag for asset in assets for tag in asset.tags)
    total_bytes = sum(asset.size_bytes for asset in assets)

    hash_groups: dict[str, list[Asset]] = defaultdict(list)
    for asset in assets:
        if asset.sha256:
            hash_groups[asset.sha256].append(asset)
    duplicates = [
        {
            "sha256": digest,
            "size_bytes": group[0].size_bytes,
            "paths": [asset.path for asset in group],
        }
        for digest, group in hash_groups.items()
        if len(group) > 1
    ]
    duplicates.sort(key=lambda item: item["size_bytes"], reverse=True)

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "repo": repo.as_posix(),
        "roots": args.roots,
        "summary": {
            "asset_count": len(assets),
            "total_bytes": total_bytes,
            "total_human": human_size(total_bytes),
            "by_class": dict(by_class),
            "by_recommendation": dict(by_reco),
            "top_tags": dict(by_tag.most_common(20)),
            "duplicate_groups": len(duplicates),
        },
        "duplicates": duplicates,
        "assets": [asdict(asset) for asset in assets],
    }


def write_markdown(catalog: dict, out_path: Path, top_n: int) -> None:
    summary = catalog["summary"]
    assets = catalog["assets"]
    duplicates = catalog["duplicates"]

    lines = [
        "# Sharpe-Renaissance Asset Catalog",
        "",
        f"- generated_at_utc: `{catalog['generated_at_utc']}`",
        f"- asset_count: `{summary['asset_count']}`",
        f"- cataloged_size: `{summary['total_human']}`",
        f"- duplicate_groups_detected: `{summary['duplicate_groups']}`",
        "",
        "## Capitalization Thesis",
        "",
        "The repo's strongest asset is not the code alone; it is the accumulated, partially proprietary research corpus: crypto archive data, Refinitiv-derived panels, alternative-data overlays, SEC-event artifacts, and validated strategy outputs. The highest-value move is to keep datasets protected while converting them into reproducible research products: catalogs, scorecards, refresh loops, and signal-readiness reports.",
        "",
        "## Recommended Product Tracks",
        "",
        "1. **Crypto regime intelligence terminal**: use CoinGecko/CryptoCompare archives plus current-regime factor labels to screen clean-growth, red-flag, and narrative-transition assets.",
        "2. **SEC-event alpha lab**: package filing-event extraction, yfinance/Refinitiv panels, and walk-forward validation as a repeatable event-alpha workflow.",
        "3. **Risk-managed allocation engine**: focus the dynamic-regime and SPY-beater work on drawdown control and paper-trading discipline before live execution.",
        "4. **Paid-data preservation layer**: treat Refinitiv and procured crypto databases as protected source-of-truth inputs, with checksums and provenance.",
        "",
        "## Summary By Class",
        "",
    ]
    for key, value in sorted(summary["by_class"].items()):
        lines.append(f"- {key}: `{value}`")

    lines.extend(["", "## Summary By Recommendation", ""])
    for key, value in sorted(summary["by_recommendation"].items()):
        lines.append(f"- {key}: `{value}`")

    lines.extend(["", f"## Top {top_n} Assets By Size", ""])
    lines.append("| Size | Class | Recommendation | Path | Tags |")
    lines.append("|---:|---|---|---|---|")
    for asset in assets[:top_n]:
        tags = ", ".join(asset["tags"])
        lines.append(
            f"| {human_size(asset['size_bytes'])} | {asset['asset_class']} | "
            f"{asset['recommendation']} | `{asset['path']}` | {tags} |"
        )

    lines.extend(["", "## Duplicate Large Assets", ""])
    if duplicates:
        lines.append("| Size | Paths |")
        lines.append("|---:|---|")
        for group in duplicates[:20]:
            paths = "<br>".join(f"`{p}`" for p in group["paths"])
            lines.append(f"| {human_size(group['size_bytes'])} | {paths} |")
    else:
        lines.append("No duplicate large assets detected with current checksum threshold.")

    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- Do not delete `data_lake/`, `deliverables/`, `From-refinitiv/`, or `backtests/outputs/` by pattern.",
            "- Archive/dedupe only after checking source, checksum, downstream references, and whether the artifact is a handoff bundle.",
            "- Keep code repositories small; keep large datasets protected by manifest, backup, and clear canonical/source-of-truth labels.",
            "- Re-run this catalog after major data collection or cleanup work.",
            "",
            "## Next Action",
            "",
            "Promote the highest-value assets into a curated `canonical` set: one crypto research DB, one full CoinGecko archive, one current-regime factor panel, one Refinitiv factor panel, one SEC-event dataset, and one paper-trading scorecard stream. Everything else should be marked as derived, deliverable, duplicate, or experimental.",
            "",
        ]
    )
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build data/research asset catalog")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--roots", nargs="+", default=DEFAULT_ROOTS, help="Roots to scan")
    parser.add_argument("--out-json", default="reports/asset_catalog.json")
    parser.add_argument("--out-md", default="reports/ASSET_CATALOG.md")
    parser.add_argument("--min-size", type=int, default=1_000_000)
    parser.add_argument("--hash-min-bytes", type=int, default=100_000_000)
    parser.add_argument("--csv-header-max-bytes", type=int, default=10_000_000)
    parser.add_argument("--top-n", type=int, default=40)
    args = parser.parse_args()

    catalog = build_catalog(args)
    out_json = Path(args.out_json)
    out_md = Path(args.out_md)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(catalog, indent=2), encoding="utf-8")
    write_markdown(catalog, out_md, args.top_n)
    print(f"wrote {out_json}")
    print(f"wrote {out_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
