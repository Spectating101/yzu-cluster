#!/usr/bin/env python3
"""Collect token metadata sidecars for verified OpenSea image deliverables.

This is intentionally metadata-only: it does not download or rewrite images.
It reads token IDs from the existing enrichment manifests, resolves tokenURI
metadata using the same collection templates/RPC logic as the image collector,
and writes raw JSON plus flat CSV tables suitable for dashboards.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests
from web3 import Web3

from opensea_image_collector import (
    Collection,
    fetch_url,
    manifest_uri,
    read_collections,
    resolve_token_metadata,
    short_error,
    slugify,
)


FOLDER_TO_SLUG = {
    "professor_zip_folder_azuki_250": "azuki",
    "professor_zip_folder_bayc_250": "bored-ape-yacht-club",
    "professor_zip_folder_clone_x_250": "clone-x",
    "professor_zip_folder_cool_cats_250": "cool-cats-nft",
    "professor_zip_folder_cryptopunks_recovered_20260514": "cryptopunks",
    "professor_zip_folder_cryptoskulls_250": "cryptoskulls",
    "professor_zip_folder_doodles_250": "doodles",
    "professor_zip_folder_mayc_250": "mutant-ape-yacht-club",
    "professor_zip_folder_meebits_250": "meebits",
    "professor_zip_folder_moonbirds_250": "moonbirds",
    "professor_zip_folder_mooncats_250": "mooncats",
    "professor_zip_folder_pudgy_penguins_250": "pudgy-penguins",
    "professor_zip_folder_supducks_250": "supducks",
    "professor_zip_folder_world_of_women_250": "world-of-women",
}

SLUG_TO_PUBLIC_FOLDER = {
    "azuki": "opensea_zip_azuki",
    "bored-ape-yacht-club": "opensea_zip_bayc",
    "clone-x": "opensea_zip_clone_x",
    "cool-cats-nft": "opensea_zip_cool_cats",
    "cryptopunks": "opensea_zip_cryptopunks",
    "cryptoskulls": "opensea_zip_cryptoskulls",
    "doodles": "opensea_zip_doodles",
    "mutant-ape-yacht-club": "opensea_zip_mayc",
    "meebits": "opensea_zip_meebits",
    "moonbirds": "opensea_zip_moonbirds",
    "mooncats": "opensea_zip_mooncats",
    "pudgy-penguins": "opensea_zip_pudgy_penguins",
    "supducks": "opensea_zip_supducks",
    "world-of-women": "opensea_zip_world_of_women",
}


TOKEN_FIELDS = [
    "collection",
    "slug",
    "public_folder",
    "token_id",
    "status",
    "metadata_path",
    "token_uri",
    "metadata_url",
    "image_uri",
    "name",
    "description",
    "attributes_json",
    "attribute_count",
    "source_status",
    "error",
]

TRAIT_FIELDS = [
    "collection",
    "slug",
    "public_folder",
    "token_id",
    "trait_type",
    "value",
    "display_type",
    "max_value",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", default="../OpenSea.zip", help="Workbook or zip containing workbook.")
    parser.add_argument(
        "--enrichment-root",
        default="deliverables/opensea_collection_enrichment_20260514",
        help="Existing enrichment root containing token_manifest_enriched.csv files.",
    )
    parser.add_argument(
        "--out-root",
        default="deliverables/opensea_metadata_sidecars_20260518",
        help="Output root for metadata sidecars.",
    )
    parser.add_argument("--rpc-url", default="https://ethereum-rpc.publicnode.com", help="Ethereum RPC endpoint.")
    parser.add_argument(
        "--collections",
        default="",
        help="Comma-separated slugs or public folder names. Empty means all non-CryptoPunks collections.",
    )
    parser.add_argument("--limit-per-collection", type=int, default=0, help="Pilot limit per collection; 0 means all.")
    parser.add_argument("--workers", type=int, default=4, help="Parallel metadata fetch workers.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Delay after each completed token write.")
    parser.add_argument("--overwrite", action="store_true", help="Refetch metadata even when raw JSON exists.")
    parser.add_argument("--progress-every", type=int, default=25, help="Print one progress line every N completed tokens.")
    parser.add_argument(
        "--raw-mode",
        choices=["full", "compact", "none"],
        default="full",
        help="How to store raw JSON. compact strips/truncates huge embedded data fields.",
    )
    return parser.parse_args()


def read_manifest_tokens(enrichment_root: Path) -> dict[str, list[int]]:
    tokens: dict[str, list[int]] = {}
    for folder, slug in FOLDER_TO_SLUG.items():
        path = enrichment_root / folder / "enrichment" / "token_manifest_enriched.csv"
        if not path.exists():
            continue
        seen: set[int] = set()
        with path.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                token_text = str(row.get("token_id", "")).strip()
                if token_text.isdigit():
                    seen.add(int(token_text))
        tokens[slug] = sorted(seen)
    return tokens


def parse_attrs(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        attrs = value
    elif isinstance(value, str) and value.strip():
        try:
            attrs = json.loads(value)
        except json.JSONDecodeError:
            return []
    else:
        return []
    return [x for x in attrs if isinstance(x, dict)]


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def compact_metadata(metadata: dict[str, Any], *, limit: int = 1000) -> dict[str, Any]:
    """Return metadata with large embedded data strings shortened for sidecar storage."""
    out: dict[str, Any] = {}
    for key, value in metadata.items():
        if isinstance(value, str) and (value.startswith("data:") or len(value) > limit):
            out[key] = manifest_uri(value, limit=limit)
            out[f"_{key}_original_length"] = len(value)
        else:
            out[key] = value
    out["_raw_compacted"] = True
    return out


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


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def fetch_metadata_only(
    w3: Web3,
    session: requests.Session,
    collection: Collection,
    token_id: int,
) -> tuple[str, str, dict[str, Any]]:
    token_uri, image_uri, metadata = resolve_token_metadata(w3, session, collection, token_id)
    return token_uri, image_uri, metadata


def build_readme(out_root: Path, summaries: list[dict[str, Any]]) -> None:
    lines = [
        "# OpenSea Token Metadata Sidecars",
        "",
        "Metadata-only sidecar package for the verified OpenSea image ZIP deliverable.",
        "This package does not include or redownload NFT images.",
        "",
        "## Files",
        "",
        "- `token_metadata_index.csv`: one row per attempted token.",
        "- `traits_long.csv`: one row per parsed token trait.",
        "- `collection_metadata_summary.csv`: collection-level status counts.",
        "- `raw_json/<opensea_zip_collection>/<token_id>.json`: raw token metadata JSON when fetched successfully.",
        "",
        "## Current Coverage",
        "",
        "| Collection folder | Attempted | OK | Existing | Errors | Trait rows |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in summaries:
        lines.append(
            f"| `{row['public_folder']}` | {row['attempted']} | {row['ok']} | "
            f"{row['existing']} | {row['error']} | {row['trait_rows']} |"
        )
    lines.extend(
        [
            "",
            "Notes:",
            "- `existing` means a raw JSON file already existed locally and was reused.",
            "- CryptoPunks are excluded from this metadata fetch because the classic collection does not expose standard ERC-721 trait JSON in the same way as the later collections.",
        ]
    )
    (out_root / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    out_root = Path(args.out_root).resolve()
    raw_root = out_root / "raw_json"
    enrichment_root = Path(args.enrichment_root).resolve()

    collections = {c.slug: c for c in read_collections(Path(args.workbook).resolve())}
    manifest_tokens = read_manifest_tokens(enrichment_root)

    wanted = {slugify(x) for x in args.collections.split(",") if x.strip()}
    if wanted:
        reverse_public = {slugify(v): k for k, v in SLUG_TO_PUBLIC_FOLDER.items()}
        selected_slugs = {reverse_public.get(x, x) for x in wanted}
    else:
        selected_slugs = set(manifest_tokens)
        selected_slugs.discard("cryptopunks")

    selected_slugs = sorted(slug for slug in selected_slugs if slug in collections and slug in manifest_tokens)
    if not selected_slugs:
        raise SystemExit("No collections selected with available manifest tokens.")

    probe_w3 = Web3(Web3.HTTPProvider(args.rpc_url, request_kwargs={"timeout": 30}))
    if not probe_w3.is_connected():
        raise SystemExit(f"RPC not reachable: {args.rpc_url}")

    token_rows: list[dict[str, Any]] = []
    trait_rows: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
            "Accept": "application/json,*/*",
        }
    )

    def process(slug: str, token_id: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        collection = collections[slug]
        public_folder = SLUG_TO_PUBLIC_FOLDER.get(slug, f"opensea_zip_{slug}")
        raw_rel = Path(public_folder) / f"{token_id}.json"
        raw_path = raw_root / raw_rel
        row: dict[str, Any] = {
            "collection": collection.name,
            "slug": slug,
            "public_folder": public_folder,
            "token_id": token_id,
            "status": "",
            "metadata_path": str((Path("raw_json") / raw_rel).as_posix()) if args.raw_mode != "none" else "",
            "token_uri": "",
            "metadata_url": "",
            "image_uri": "",
            "name": "",
            "description": "",
            "attributes_json": "[]",
            "attribute_count": 0,
            "source_status": "",
            "error": "",
        }
        try:
            metadata: dict[str, Any] | None = None
            if args.raw_mode != "none" and raw_path.exists() and not args.overwrite:
                try:
                    metadata = json.loads(raw_path.read_text(encoding="utf-8"))
                    status = "existing"
                    token_uri = str(metadata.get("_token_uri", ""))
                    image_uri = str(metadata.get("image") or metadata.get("image_url") or metadata.get("image_data") or "")
                except (OSError, json.JSONDecodeError):
                    metadata = None

            if metadata is None:
                local_w3 = Web3(Web3.HTTPProvider(args.rpc_url, request_kwargs={"timeout": 30}))
                token_uri, image_uri, metadata = fetch_metadata_only(local_w3, session, collection, token_id)
                metadata["_token_uri"] = token_uri
                if args.raw_mode != "none":
                    stored_metadata = compact_metadata(metadata) if args.raw_mode == "compact" else metadata
                    write_json_atomic(raw_path, stored_metadata)
                status = "ok"

            attrs = parse_attrs(metadata.get("attributes", []))
            row.update(
                {
                    "status": status,
                    "token_uri": manifest_uri(token_uri),
                    "metadata_url": manifest_uri(str(metadata.get("_metadata_url", ""))),
                    "image_uri": manifest_uri(image_uri),
                    "name": normalize_text(metadata.get("name", "")),
                    "description": normalize_text(metadata.get("description", "")),
                    "attributes_json": json.dumps(attrs, ensure_ascii=False, separators=(",", ":")),
                    "attribute_count": len(attrs),
                    "source_status": "metadata_with_traits" if attrs else "metadata_no_traits",
                }
            )
            traits: list[dict[str, Any]] = []
            for attr in attrs:
                trait_type = attr.get("trait_type") or attr.get("type") or attr.get("trait") or ""
                value = attr.get("value", "")
                traits.append(
                    {
                        "collection": collection.name,
                        "slug": slug,
                        "public_folder": public_folder,
                        "token_id": token_id,
                        "trait_type": normalize_text(trait_type),
                        "value": normalize_text(value),
                        "display_type": normalize_text(attr.get("display_type", "")),
                        "max_value": normalize_text(attr.get("max_value", "")),
                    }
                )
            return row, traits
        except Exception as exc:  # noqa: BLE001 - errors are retained as data-quality rows.
            row.update({"status": "error", "source_status": "error", "error": short_error(exc)})
            return row, []

    for slug in selected_slugs:
        public_folder = SLUG_TO_PUBLIC_FOLDER.get(slug, f"opensea_zip_{slug}")
        token_ids = manifest_tokens[slug]
        if args.limit_per_collection > 0:
            token_ids = token_ids[: args.limit_per_collection]
        print(f"[collection] {slug} tokens={len(token_ids)}", flush=True)

        rows_before = len(token_rows)
        traits_before = len(trait_rows)
        status_counts: Counter[str] = Counter()
        workers = max(1, int(args.workers or 1))
        completed = 0
        if workers == 1:
            iterator = (process(slug, token_id) for token_id in token_ids)
        else:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [executor.submit(process, slug, token_id) for token_id in token_ids]
                iterator = (future.result() for future in as_completed(futures))

                for row, traits in iterator:
                    completed += 1
                    token_rows.append(row)
                    trait_rows.extend(traits)
                    status_counts[row["status"]] += 1
                    if row["status"] == "error" or completed == 1 or completed % max(1, args.progress_every) == 0:
                        print(
                            f"{row['status']} {public_folder} #{row['token_id']} "
                            f"completed={completed}/{len(token_ids)} errors={status_counts.get('error', 0)}",
                            flush=True,
                        )
                    if args.sleep:
                        time.sleep(args.sleep)
            summaries.append(
                {
                    "collection": collections[slug].name,
                    "slug": slug,
                    "public_folder": public_folder,
                    "attempted": len(token_rows) - rows_before,
                    "ok": status_counts.get("ok", 0),
                    "existing": status_counts.get("existing", 0),
                    "error": status_counts.get("error", 0),
                    "trait_rows": len(trait_rows) - traits_before,
                }
            )
            continue

        for row, traits in iterator:
            completed += 1
            token_rows.append(row)
            trait_rows.extend(traits)
            status_counts[row["status"]] += 1
            if row["status"] == "error" or completed == 1 or completed % max(1, args.progress_every) == 0:
                print(
                    f"{row['status']} {public_folder} #{row['token_id']} "
                    f"completed={completed}/{len(token_ids)} errors={status_counts.get('error', 0)}",
                    flush=True,
                )
            if args.sleep:
                time.sleep(args.sleep)

        summaries.append(
            {
                "collection": collections[slug].name,
                "slug": slug,
                "public_folder": public_folder,
                "attempted": len(token_rows) - rows_before,
                "ok": status_counts.get("ok", 0),
                "existing": status_counts.get("existing", 0),
                "error": status_counts.get("error", 0),
                "trait_rows": len(trait_rows) - traits_before,
            }
        )

    token_rows.sort(key=lambda row: (str(row["public_folder"]), int(row["token_id"])))
    trait_rows.sort(key=lambda row: (str(row["public_folder"]), int(row["token_id"]), str(row["trait_type"]), str(row["value"])))
    summaries.sort(key=lambda row: str(row["public_folder"]))

    write_csv(out_root / "token_metadata_index.csv", token_rows, TOKEN_FIELDS)
    write_csv(out_root / "traits_long.csv", trait_rows, TRAIT_FIELDS)
    write_csv(
        out_root / "collection_metadata_summary.csv",
        summaries,
        ["collection", "slug", "public_folder", "attempted", "ok", "existing", "error", "trait_rows"],
    )
    write_json(out_root / "collection_metadata_summary.json", summaries)
    build_readme(out_root, summaries)

    total_errors = sum(int(row["error"]) for row in summaries)
    print(f"done collections={len(summaries)} tokens={len(token_rows)} traits={len(trait_rows)} errors={total_errors}")
    return 0 if total_errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
