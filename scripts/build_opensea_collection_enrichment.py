#!/usr/bin/env python3
"""Build small per-collection enrichment sidecars for OpenSea professor folders.

This script intentionally does not redownload images. It turns the existing
manifests, embedded manifest_detail.csv files, and recovered rich archives into
CSV/JSON files that can sit beside each collection's image ZIPs.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


COLLECTIONS = {
    "professor_zip_folder_azuki_250": {"label": "Azuki"},
    "professor_zip_folder_bayc_250": {
        "label": "Bored Ape Yacht Club",
        "rich_zip": "opensea_bayc_rich_dataset_20260512.zip",
    },
    "professor_zip_folder_clone_x_250": {"label": "CLONE X"},
    "professor_zip_folder_cool_cats_250": {"label": "Cool Cats"},
    "professor_zip_folder_cryptopunks_recovered_20260514": {
        "label": "CryptoPunks",
        "rich_zip": "opensea_cryptopunks_rich_dataset_20260512.zip",
        "professor_zip": "opensea_cryptopunks_professor_images_20260512.zip",
    },
    "professor_zip_folder_cryptoskulls_250": {"label": "CryptoSkulls"},
    "professor_zip_folder_doodles_250": {"label": "Doodles"},
    "professor_zip_folder_mayc_250": {"label": "Mutant Ape Yacht Club"},
    "professor_zip_folder_meebits_250": {"label": "Meebits"},
    "professor_zip_folder_moonbirds_250": {"label": "Moonbirds"},
    "professor_zip_folder_mooncats_250": {"label": "MoonCats"},
    "professor_zip_folder_pudgy_penguins_250": {"label": "Pudgy Penguins"},
    "professor_zip_folder_supducks_250": {"label": "SupDucks"},
    "professor_zip_folder_world_of_women_250": {"label": "World of Women"},
}

DETAIL_FIELDS = [
    "collection",
    "token_id",
    "image_filename",
    "zip_file",
    "width",
    "height",
    "source_format",
    "token_uri",
    "metadata_url",
    "image_uri",
    "image_url",
    "name",
    "description",
    "attributes_json",
    "metadata_path",
    "source_dataset",
    "source_record_id",
    "source_sha256",
    "status",
    "error",
]

TOKEN_FIELDS = [
    "collection_folder",
    "collection",
    "token_id",
    "image_filename",
    "zip_file",
    "metadata_status",
    "detail_status",
    *DETAIL_FIELDS[4:],
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--support-root", required=True, help="Local mirror of Drive support files.")
    parser.add_argument("--out-root", required=True, help="Output root for per-collection enrichment folders.")
    parser.add_argument(
        "--local-zip-root",
        action="append",
        default=[],
        help="Local directory containing image ZIPs; may be repeated.",
    )
    parser.add_argument(
        "--rich-root",
        action="append",
        default=[],
        help="Local directory containing recovered rich dataset ZIPs; may be repeated.",
    )
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


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def token_sort_key(row: dict[str, Any]) -> int:
    try:
        return int(row.get("token_id", ""))
    except (TypeError, ValueError):
        return 0


def normalize_manifest_rows(rows: list[dict[str, str]], label: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for row in rows:
        token_id = str(row.get("token_id", "")).strip()
        if not token_id:
            continue
        image_filename = (
            row.get("image_filename")
            or row.get("file_in_zip")
            or row.get("output_path")
            or f"{label}/{token_id}.jpg"
        )
        out.append(
            {
                "collection": row.get("collection") or label,
                "token_id": str(int(token_id)),
                "image_filename": str(image_filename),
                "zip_file": str(row.get("zip_file") or ""),
            }
        )
    out.sort(key=token_sort_key)
    return out


def find_manifest(support_root: Path, folder: str) -> Path | None:
    candidates = [
        support_root / folder / "manifest_simple.csv",
        support_root / folder / "manifest_simple_tail_18751_19764.csv",
    ]
    if folder == "professor_zip_folder_cryptopunks_recovered_20260514":
        return None
    for path in candidates:
        if path.exists():
            return path
    matches = sorted((support_root / folder).glob("*manifest*.csv")) if (support_root / folder).exists() else []
    return matches[0] if matches else None


def read_sha256s(support_root: Path, folder: str) -> dict[str, str]:
    out: dict[str, str] = {}
    folder_root = support_root / folder
    if not folder_root.exists():
        return out
    for path in sorted(folder_root.glob("SHA256SUMS*.txt")):
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            parts = line.strip().split()
            if len(parts) >= 2:
                out[Path(parts[-1]).name] = parts[0]
    return out


def find_rich_zip(rich_roots: list[Path], name: str) -> Path | None:
    for root in rich_roots:
        path = root / name
        if path.exists():
            return path
    return None


def read_rich_manifest(rich_zip: Path) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]], list[str]]:
    with zipfile.ZipFile(rich_zip) as zf:
        manifest_names = [name for name in zf.namelist() if name.endswith("download_manifest.csv")]
        if not manifest_names:
            return [], {}, []
        manifest_name = sorted(manifest_names)[0]
        with zf.open(manifest_name) as fh:
            rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))
        json_names = [name for name in zf.namelist() if name.lower().endswith(".json")]

    details: dict[int, dict[str, Any]] = {}
    manifest_rows: list[dict[str, Any]] = []
    for row in rows:
        token_text = row.get("token_id") or Path(row.get("output_path", "")).stem
        if not str(token_text).isdigit():
            continue
        token_id = int(token_text)
        attrs = row.get("attributes_json", "")
        detail = {
            "collection": row.get("collection", ""),
            "token_id": str(token_id),
            "image_filename": row.get("output_path", "") or row.get("image_filename", ""),
            "zip_file": "",
            "width": row.get("width", ""),
            "height": row.get("height", ""),
            "source_format": row.get("source_format", ""),
            "token_uri": row.get("token_uri", ""),
            "metadata_url": row.get("metadata_url", ""),
            "image_uri": row.get("image_uri", ""),
            "image_url": row.get("image_url", ""),
            "name": row.get("name", ""),
            "description": row.get("description", ""),
            "attributes_json": attrs,
            "metadata_path": row.get("metadata_path", ""),
            "source_dataset": row.get("source_dataset", ""),
            "source_record_id": row.get("source_record_id", ""),
            "source_sha256": row.get("source_sha256", ""),
            "status": row.get("status", "ok"),
            "error": row.get("error", ""),
        }
        details[token_id] = detail
        manifest_rows.append(
            {
                "collection": row.get("collection", ""),
                "token_id": str(token_id),
                "image_filename": row.get("output_path", "") or row.get("image_filename", ""),
                "zip_file": "",
            }
        )
    manifest_rows.sort(key=token_sort_key)
    return manifest_rows, details, json_names


def find_zip_paths(local_roots: list[Path], folder: str) -> list[Path]:
    paths: list[Path] = []
    for root in local_roots:
        direct = root / folder
        if direct.exists():
            paths.extend(sorted(direct.glob("*.zip")))
        elif root.name == folder:
            paths.extend(sorted(root.glob("*.zip")))
    return list(dict.fromkeys(paths))


def read_embedded_details(zip_paths: list[Path]) -> tuple[dict[int, dict[str, Any]], dict[str, int]]:
    details: dict[int, dict[str, Any]] = {}
    stats = {"zips_checked": 0, "zips_with_manifest_detail": 0, "detail_rows": 0, "zip_errors": 0}
    for zip_path in zip_paths:
        stats["zips_checked"] += 1
        try:
            with zipfile.ZipFile(zip_path) as zf:
                if "manifest_detail.csv" not in zf.namelist():
                    continue
                stats["zips_with_manifest_detail"] += 1
                with zf.open("manifest_detail.csv") as fh:
                    reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))
                    for row in reader:
                        token_id = int(row["token_id"])
                        row = {field: row.get(field, "") for field in DETAIL_FIELDS}
                        row["token_id"] = str(token_id)
                        details[token_id] = row
                        stats["detail_rows"] += 1
        except Exception:
            stats["zip_errors"] += 1
    return details, stats


def parse_attrs(raw: str) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        return [{"trait_type": key, "value": val} for key, val in value.items()]
    return []


def clean_trait_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return str(value)


def build_traits(token_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    trait_rows: list[dict[str, Any]] = []
    for row in token_rows:
        attrs = parse_attrs(str(row.get("attributes_json", "")))
        for attr in attrs:
            trait_type = str(attr.get("trait_type") or attr.get("type") or "").strip()
            value = clean_trait_value(attr.get("value"))
            if not trait_type and not value:
                continue
            trait_rows.append(
                {
                    "collection": row.get("collection", ""),
                    "token_id": row.get("token_id", ""),
                    "trait_type": trait_type,
                    "value": value,
                    "display_type": attr.get("display_type", ""),
                    "max_value": attr.get("max_value", ""),
                    "source": row.get("metadata_status", ""),
                }
            )

    token_count = len(token_rows)
    counts = Counter((row["trait_type"], row["value"]) for row in trait_rows)
    trait_summary = [
        {
            "trait_type": trait_type,
            "value": value,
            "token_count": count,
            "frequency": f"{count / token_count:.10f}" if token_count else "",
        }
        for (trait_type, value), count in sorted(counts.items(), key=lambda item: (item[0][0], item[0][1]))
    ]

    by_token: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in trait_rows:
        by_token[str(row["token_id"])].append(row)
    rarity_rows: list[dict[str, Any]] = []
    for token_id, rows in sorted(by_token.items(), key=lambda item: int(item[0])):
        score = 0.0
        for row in rows:
            count = counts[(row["trait_type"], row["value"])]
            if token_count and count:
                score += -math.log(count / token_count)
        rarity_rows.append(
            {
                "token_id": token_id,
                "trait_count": len(rows),
                "rarity_score_sum": f"{score:.10f}",
                "rarity_score_avg": f"{score / len(rows):.10f}" if rows else "",
            }
        )
    return trait_rows, trait_summary, rarity_rows


def build_zip_inventory(manifest_rows: list[dict[str, str]], sha256s: dict[str, str]) -> list[dict[str, Any]]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for row in manifest_rows:
        zip_file = row.get("zip_file") or ""
        if zip_file:
            grouped[Path(zip_file).name].append(int(row["token_id"]))
    return [
        {
            "zip_file": zip_file,
            "manifest_image_count": len(ids),
            "min_token_id": min(ids) if ids else "",
            "max_token_id": max(ids) if ids else "",
            "sha256": sha256s.get(zip_file, ""),
        }
        for zip_file, ids in sorted(grouped.items())
    ]


def build_collection(
    folder: str,
    spec: dict[str, str],
    support_root: Path,
    out_root: Path,
    local_zip_roots: list[Path],
    rich_roots: list[Path],
) -> dict[str, Any]:
    label = spec["label"]
    manifest_rows: list[dict[str, str]] = []
    rich_json_names: list[str] = []
    rich_details: dict[int, dict[str, Any]] = {}
    rich_zip_name = spec.get("rich_zip", "")
    rich_zip = find_rich_zip(rich_roots, rich_zip_name) if rich_zip_name else None

    if rich_zip:
        rich_manifest_rows, rich_details, rich_json_names = read_rich_manifest(rich_zip)
        manifest_rows = rich_manifest_rows

    if not manifest_rows:
        manifest_path = find_manifest(support_root, folder)
        if manifest_path:
            manifest_rows = normalize_manifest_rows(read_csv(manifest_path), label)

    if not manifest_rows and spec.get("professor_zip"):
        # CryptoPunks professor zip is monolithic and the rich manifest does not
        # record the professor zip filename. Build a simple 0-9999 mapping.
        manifest_rows = [
            {
                "collection": label,
                "token_id": str(token_id),
                "image_filename": f"OpenSea/CryptoPunks/{token_id}.jpg",
                "zip_file": spec["professor_zip"],
            }
            for token_id in range(10000)
        ]

    embedded_details, embedded_stats = read_embedded_details(find_zip_paths(local_zip_roots, folder))
    details = dict(embedded_details)
    details.update(rich_details)

    token_rows: list[dict[str, Any]] = []
    for row in manifest_rows:
        token_id = int(row["token_id"])
        detail = details.get(token_id, {})
        attrs = str(detail.get("attributes_json", ""))
        if detail and parse_attrs(attrs):
            metadata_status = "metadata_with_traits"
        elif detail:
            metadata_status = "image_source_audit_only"
        else:
            metadata_status = "manifest_only"
        token_row = {
            "collection_folder": folder,
            "collection": detail.get("collection") or row["collection"] or label,
            "token_id": str(token_id),
            "image_filename": detail.get("image_filename") or row["image_filename"],
            "zip_file": detail.get("zip_file") or row["zip_file"],
            "metadata_status": metadata_status,
            "detail_status": "detail_available" if detail else "manifest_only",
        }
        if not token_row["zip_file"] and spec.get("professor_zip"):
            token_row["zip_file"] = spec["professor_zip"]
        for field in DETAIL_FIELDS[4:]:
            token_row[field] = detail.get(field, "")
        token_rows.append(token_row)
    token_rows.sort(key=token_sort_key)

    traits, trait_summary, rarity = build_traits(token_rows)
    sha256s = read_sha256s(support_root, folder)
    zip_inventory = build_zip_inventory(manifest_rows, sha256s)
    status_counts = Counter(row["metadata_status"] for row in token_rows)
    token_ids = [int(row["token_id"]) for row in token_rows]
    summary = {
        "collection_folder": folder,
        "collection_label": label,
        "token_rows": len(token_rows),
        "min_token_id": min(token_ids) if token_ids else None,
        "max_token_id": max(token_ids) if token_ids else None,
        "zip_count_from_manifest": len(zip_inventory),
        "metadata_status_counts": dict(sorted(status_counts.items())),
        "traits_long_rows": len(traits),
        "trait_summary_rows": len(trait_summary),
        "rarity_rows": len(rarity),
        "rich_zip_used": str(rich_zip) if rich_zip else "",
        "rich_metadata_json_count": len(rich_json_names),
        "embedded_manifest_detail_stats": embedded_stats,
        "generated_from": "existing manifests, embedded manifest_detail.csv files, and recovered rich archives",
    }

    out_dir = out_root / folder / "enrichment"
    out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out_dir / "token_manifest_enriched.csv", token_rows, TOKEN_FIELDS)
    write_csv(out_dir / "zip_inventory.csv", zip_inventory, ["zip_file", "manifest_image_count", "min_token_id", "max_token_id", "sha256"])
    write_csv(out_dir / "traits_long.csv", traits, ["collection", "token_id", "trait_type", "value", "display_type", "max_value", "source"])
    write_csv(out_dir / "trait_summary.csv", trait_summary, ["trait_type", "value", "token_count", "frequency"])
    write_csv(out_dir / "rarity_scores.csv", rarity, ["token_id", "trait_count", "rarity_score_sum", "rarity_score_avg"])
    write_csv(out_dir / "metadata_coverage.csv", [summary], sorted(summary))
    write_json(out_dir / "collection_summary.json", summary)
    (out_dir / "README_ENRICHMENT.md").write_text(readme_text(summary), encoding="utf-8")
    return summary


def readme_text(summary: dict[str, Any]) -> str:
    counts = summary["metadata_status_counts"]
    lines = [
        f"# {summary['collection_label']} Enrichment",
        "",
        "This folder is a metadata sidecar for the professor image ZIP deliverable.",
        "It does not replace the image ZIPs.",
        "",
        "## Files",
        "",
        "- `token_manifest_enriched.csv`: token-level manifest plus any available metadata/source fields.",
        "- `zip_inventory.csv`: ZIP-level manifest counts and SHA256 values where available.",
        "- `traits_long.csv`: one row per token trait when trait metadata exists.",
        "- `trait_summary.csv`: trait value frequency table when traits exist.",
        "- `rarity_scores.csv`: simple trait-frequency rarity scores when traits exist.",
        "- `collection_summary.json`: machine-readable coverage summary.",
        "- `metadata_coverage.csv`: one-row CSV version of the coverage summary.",
        "",
        "## Coverage",
        "",
        f"- Tokens in manifest: {summary['token_rows']}",
        f"- Token ID range: {summary['min_token_id']} to {summary['max_token_id']}",
        f"- ZIPs in manifest: {summary['zip_count_from_manifest']}",
        f"- Trait rows: {summary['traits_long_rows']}",
        f"- Rich metadata JSON files counted: {summary['rich_metadata_json_count']}",
        "",
        "Metadata status counts:",
    ]
    for key, value in sorted(counts.items()):
        lines.append(f"- `{key}`: {value}")
    lines.extend(
        [
            "",
            "Statuses:",
            "",
            "- `metadata_with_traits`: usable token metadata with attributes/traits is present.",
            "- `image_source_audit_only`: source URL/dimensions were preserved, but traits are not present in this package.",
            "- `manifest_only`: only collection/token/image/ZIP mapping is available in the current package.",
            "",
            "Generated from existing manifests, embedded `manifest_detail.csv` files, and recovered rich archives. No image redownload was performed.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    support_root = Path(args.support_root).resolve()
    out_root = Path(args.out_root).resolve()
    local_zip_roots = [Path(path).resolve() for path in args.local_zip_root]
    rich_roots = [Path(path).resolve() for path in args.rich_root]
    summaries = []
    for folder, spec in COLLECTIONS.items():
        summary = build_collection(folder, spec, support_root, out_root, local_zip_roots, rich_roots)
        summaries.append(summary)
        print(
            f"{folder}: tokens={summary['token_rows']} traits={summary['traits_long_rows']} "
            f"statuses={summary['metadata_status_counts']}",
            flush=True,
        )
    write_csv(out_root / "ENRICHMENT_COLLECTION_SUMMARY.csv", summaries, sorted({key for row in summaries for key in row}))
    write_json(out_root / "ENRICHMENT_COLLECTION_SUMMARY.json", summaries)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
