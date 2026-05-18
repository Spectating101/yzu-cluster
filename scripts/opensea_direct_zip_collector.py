#!/usr/bin/env python3
"""Collect OpenSea workbook images directly into professor-friendly zip chunks."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import OrderedDict
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageFile, ImageOps
from web3 import Web3

from opensea_image_collector import (
    Collection,
    ERC721_METADATA_ABI,
    candidate_urls,
    manifest_uri,
    read_collections,
    read_token_ids,
    resolve_token_metadata,
    short_error,
    slugify,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", default="../OpenSea/List of NFT Collections.xlsx")
    parser.add_argument("--rpc-url", default="https://ethereum-rpc.publicnode.com")
    parser.add_argument("--collection", default="", help="Collection name or slug")
    parser.add_argument("--out-dir", required=True, help="Directory that will contain chunk zips")
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0, help="0 means collection supply")
    parser.add_argument("--token-id-file", default="")
    parser.add_argument(
        "--source-manifest",
        default="",
        help="Optional preserved manifest with token_id,image_filename,zip_file,source_image_url columns.",
    )
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--allow-partial-source-batches",
        action="store_true",
        help="Permit source-manifest token filters that would write partial zip chunks. Intended only for scratch tests.",
    )
    return parser.parse_args()


SUPDUCKS_CONTRACT = "0x3fe1a4c1481c8351e91b64d5c398b159de07cbc5"

KNOWN_IMAGE_FALLBACKS: dict[str, dict[int, list[str]]] = {
    "supducks": {
        56: [
            "https://gateway.pinata.cloud/ipfs/Qmb2jQrNXVeLFVF9BBzZUr2gtXnViF9DrovHQg4zXqxRLn",
        ],
        93: [
            "https://gateway.pinata.cloud/ipfs/QmeSCceAYN7Zp9kuqYRv2xjcQ6Vv8aoJtNM2kdN5pzM5hw",
        ],
        154: [
            "https://gateway.pinata.cloud/ipfs/QmY9LPZic4Z4c4L5Cw7jBnMuVRgo5ENRMPe28p88xvaoii",
        ],
        212: [
            "https://gateway.pinata.cloud/ipfs/QmPF2ZqMFufUF8WnZB39XCot7QjpjqxQxxjMHDibn4DABm",
        ],
        302: [
            "https://gateway.pinata.cloud/ipfs/QmYbDuRdF9S6WLb7pCK5gt8XZe9XUUcrHz55qkTZsGMyNd",
        ],
        323: [
            "https://gateway.pinata.cloud/ipfs/QmPWozuT7ZpB9JJYz6iuNgnCtyyncdBZHy6NqpYvMgRTEc",
        ],
        331: [
            "ipfs://Qmb3ysUAK2qTAyaJ2ijFp1LAYzpSfihKuAgZzTsQFMacUM",
            "https://gateway.pinata.cloud/ipfs/bafybeihxgulhmkgpjwlveeowzhutbti2hcklx2je3me47c7roprltoqfva/10/331",
        ],
        429: [
            "https://gateway.pinata.cloud/ipfs/QmQaMT2bAcxDRKU6Dj45z9XqeLN7XeHutzUNhc6WmBGBC8",
        ],
    }
}


def to_jpg_bytes(raw: bytes) -> tuple[bytes, int, int, str]:
    try:
        img_context = Image.open(io.BytesIO(raw))
        img_context.load()
    except (OSError, SyntaxError):
        previous = ImageFile.LOAD_TRUNCATED_IMAGES
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try:
            img_context = Image.open(io.BytesIO(raw))
            img_context.load()
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = previous

    with img_context as img:
        source_format = img.format or ""
        img = ImageOps.exif_transpose(img)
        if img.mode in {"RGBA", "LA"}:
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.getchannel("A"))
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, "JPEG", quality=95, optimize=True)
        return out.getvalue(), img.width, img.height, source_format


def fetch_image_bytes(session: requests.Session, image_uri: str, *, _depth: int = 0) -> tuple[str, bytes, int, int, str]:
    last_error = ""
    for url in candidate_urls(image_uri):
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            try:
                resp = session.get(url, timeout=(10, 45))
                if resp.ok:
                    ctype = resp.headers.get("content-type", "").lower()
                    raw_head = resp.content[:64].lstrip()
                    if _depth < 2 and ("json" in ctype or raw_head.startswith(b"{")):
                        try:
                            metadata = json.loads(resp.content.decode("utf-8"))
                        except Exception as exc:  # noqa: BLE001 - fall through to image decode error.
                            last_error = f"{type(exc).__name__}: {exc} {url}"
                        else:
                            nested_image_uris = [
                                metadata.get("image"),
                                metadata.get("static_image"),
                                metadata.get("image_url"),
                                metadata.get("og_image"),
                                metadata.get("image_data"),
                            ]
                            nested_error = ""
                            for nested_image_uri in nested_image_uris:
                                if not nested_image_uri:
                                    continue
                                try:
                                    return fetch_image_bytes(session, str(nested_image_uri), _depth=_depth + 1)
                                except Exception as exc:  # noqa: BLE001 - try all metadata image candidates.
                                    nested_error = f"{type(exc).__name__}: {exc}"
                            if nested_error:
                                last_error = nested_error
                    try:
                        jpg, width, height, source_format = to_jpg_bytes(resp.content)
                        return url, jpg, width, height, source_format
                    except Exception as exc:  # noqa: BLE001 - alternate gateways may return cleaner bytes.
                        last_error = f"{type(exc).__name__}: {exc} {url}"
                        break
                last_error = f"http {resp.status_code} {url}"
                if resp.status_code in {408, 425, 429, 500, 502, 503, 504} and attempt < max_attempts:
                    time.sleep(min(10.0, 0.75 * 2 ** (attempt - 1)))
                    continue
                break
            except Exception as exc:  # noqa: BLE001 - manifest captures source failures.
                last_error = f"{type(exc).__name__}: {exc}"
                if attempt < max_attempts:
                    time.sleep(min(10.0, 0.75 * 2 ** (attempt - 1)))
                    continue
                break
    raise RuntimeError(last_error or f"no image candidate URL for {image_uri}")


def is_degraded_preview(slug: str, url: str, width: int, height: int) -> bool:
    normalized_url = (url or "").lower()
    if "opensea.io/" in normalized_url and "opengraph-image" in normalized_url:
        return True
    if slug == "supducks" and width == 1200 and height == 630:
        return True
    return False


def fetch_first_image_bytes(
    session: requests.Session,
    image_uris: list[str],
    *,
    slug: str = "",
) -> tuple[str, bytes, int, int, str]:
    last_error = ""
    for image_uri in image_uris:
        if not image_uri:
            continue
        try:
            image_url, jpg, width, height, source_format = fetch_image_bytes(session, image_uri)
            if is_degraded_preview(slug, image_url, width, height):
                last_error = f"degraded preview image rejected {width}x{height} {image_url}"
                continue
            return image_url, jpg, width, height, source_format
        except Exception as exc:  # noqa: BLE001 - try configured fallbacks before failing.
            last_error = short_error(exc)
    raise RuntimeError(last_error or "no usable image URI")


def display_prefix(slug: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", slug.upper()).strip("_")


def chunk_name(slug: str, first: int, last: int) -> str:
    return f"{slug.replace('-', '_')}_{first:05d}-{last:05d}.zip"


def row_fields() -> list[str]:
    return [
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
        "status",
        "error",
    ]


def known_image_fallbacks(slug: str, token_id: int) -> list[str]:
    fallbacks = list(KNOWN_IMAGE_FALLBACKS.get(slug, {}).get(token_id, []))
    return list(dict.fromkeys(fallbacks))


def opensea_preview_fallback(slug: str, token_id: int) -> list[str]:
    return []


def read_source_manifest(path: Path, *, token_id_filter: set[int] | None = None) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        required = {"collection", "token_id", "image_filename", "zip_file", "source_image_url"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"source manifest missing columns: {sorted(missing)}")
        records: list[dict[str, Any]] = []
        for row in reader:
            token_id = int(row["token_id"])
            if token_id_filter is not None and token_id not in token_id_filter:
                continue
            records.append(
                {
                    "collection": row["collection"],
                    "token_id": token_id,
                    "name": row.get("name", ""),
                    "image_filename": row["image_filename"],
                    "zip_file": row["zip_file"],
                    "source_image_url": row["source_image_url"],
                }
            )
    records.sort(key=lambda item: int(item["token_id"]))
    return records


def source_batches(records: list[dict[str, Any]], batch_size: int) -> list[tuple[str, list[dict[str, Any]]]]:
    grouped: "OrderedDict[str, list[dict[str, Any]]]" = OrderedDict()
    for record in records:
        zip_file = str(record.get("zip_file") or "")
        if zip_file:
            grouped.setdefault(zip_file, []).append(record)
    if grouped:
        return list(grouped.items())

    batches = []
    for index in range(0, len(records), batch_size):
        batch = records[index : index + batch_size]
        first = int(batch[0]["token_id"])
        last = int(batch[-1]["token_id"])
        slug = slugify(str(batch[0]["collection"]))
        batches.append((chunk_name(slug, first, last), batch))
    return batches


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    token_id_filter = set(read_token_ids(Path(args.token_id_file).expanduser().resolve())) if args.token_id_file else None

    full_source_records: list[dict[str, Any]] = []
    source_records: list[dict[str, Any]] = []
    w3: Web3 | None = None
    collection: Collection
    token_ids: list[int] = []
    if args.source_manifest:
        source_manifest_path = Path(args.source_manifest).expanduser().resolve()
        full_source_records = read_source_manifest(source_manifest_path)
        if token_id_filter is None:
            source_records = full_source_records
        else:
            source_records = [record for record in full_source_records if int(record["token_id"]) in token_id_filter]
        if not source_records:
            raise SystemExit("source manifest produced no records")
        if token_id_filter is not None and not args.allow_partial_source_batches:
            full_counts: dict[str, int] = {}
            selected_counts: dict[str, int] = {}
            for record in full_source_records:
                full_counts[str(record["zip_file"])] = full_counts.get(str(record["zip_file"]), 0) + 1
            for record in source_records:
                selected_counts[str(record["zip_file"])] = selected_counts.get(str(record["zip_file"]), 0) + 1
            partial = [
                f"{zip_file} selected={selected_counts[zip_file]} expected={full_counts[zip_file]}"
                for zip_file in selected_counts
                if selected_counts[zip_file] != full_counts[zip_file]
            ]
            if partial:
                raise SystemExit(
                    "token-id-file must include complete source-manifest zip chunks; "
                    f"use --allow-partial-source-batches only for scratch tests. Partial chunks: {partial[:8]}"
                )
        collection_name = str(source_records[0]["collection"])
        collection_slug = slugify(args.collection or collection_name)
        collection = Collection(collection_name, collection_slug, len(source_records), "", "")
        if collection.slug == "supducks":
            w3 = Web3(Web3.HTTPProvider(args.rpc_url, request_kwargs={"timeout": 30}))
    else:
        if not args.collection:
            raise SystemExit("--collection is required unless --source-manifest is used")
        workbook = Path(args.workbook).expanduser().resolve()
        wanted = slugify(args.collection)
        collections = read_collections(workbook)
        matches = [c for c in collections if c.slug == wanted or slugify(c.name) == wanted]
        if not matches:
            raise SystemExit(f"collection not found in workbook: {args.collection}")
        collection = matches[0]

        w3 = Web3(Web3.HTTPProvider(args.rpc_url, request_kwargs={"timeout": 30}))
        if not w3.is_connected():
            raise SystemExit(f"RPC not reachable: {args.rpc_url}")

        if token_id_filter is not None:
            token_ids = sorted(token_id_filter)
        else:
            end = collection.supply if args.limit <= 0 else min(collection.supply, args.start + args.limit)
            token_ids = list(range(args.start, end))

    prefix = display_prefix(collection.slug)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121 Safari/537.36",
            "Accept": "application/json,image/avif,image/webp,image/png,image/jpeg,*/*",
            "Connection": "close",
        }
    )

    def collect_one(token_id: int) -> dict[str, Any]:
        row = {
            "collection": collection.name,
            "token_id": token_id,
            "image_filename": f"{prefix}/{token_id}.jpg",
            "zip_file": "",
            "width": "",
            "height": "",
            "source_format": "",
            "token_uri": "",
            "metadata_url": "",
            "image_uri": "",
            "image_url": "",
            "name": "",
            "description": "",
            "attributes_json": "",
            "status": "",
            "error": "",
            "_bytes": b"",
        }
        try:
            local_session = requests.Session()
            local_session.headers.update(session.headers)
            assert w3 is not None
            token_uri, image_uri, metadata = resolve_token_metadata(w3, local_session, collection, token_id)
            image_url, jpg, width, height, source_format = fetch_first_image_bytes(
                local_session,
                [image_uri],
                slug=collection.slug,
            )
            row.update(
                {
                    "width": width,
                    "height": height,
                    "source_format": source_format,
                    "token_uri": manifest_uri(token_uri),
                    "metadata_url": manifest_uri(metadata.get("_metadata_url", "")),
                    "image_uri": manifest_uri(image_uri),
                    "image_url": manifest_uri(image_url),
                    "name": str(metadata.get("name", "")),
                    "description": str(metadata.get("description", "")),
                    "attributes_json": json.dumps(metadata.get("attributes", []), ensure_ascii=False, separators=(",", ":")),
                    "status": "ok",
                    "_bytes": jpg,
                }
            )
        except Exception as exc:  # noqa: BLE001 - kept in manifest.
            row.update({"status": "error", "error": short_error(exc)})
        return row

    def collect_one_from_source(record: dict[str, Any]) -> dict[str, Any]:
        token_id = int(record["token_id"])
        source_image_url = str(record["source_image_url"])
        image_uris = [source_image_url, *known_image_fallbacks(collection.slug, token_id)]
        if collection.slug == "supducks" and w3 is not None:
            try:
                contract = w3.eth.contract(
                    address=Web3.to_checksum_address(SUPDUCKS_CONTRACT),
                    abi=ERC721_METADATA_ABI,
                )
                image_uris.append(str(contract.functions.tokenURI(token_id).call()))
            except Exception:
                pass
        image_uris.extend(opensea_preview_fallback(collection.slug, token_id))
        row = {
            "collection": str(record["collection"]),
            "token_id": token_id,
            "image_filename": str(record.get("image_filename") or f"{prefix}/{token_id}.jpg"),
            "zip_file": "",
            "width": "",
            "height": "",
            "source_format": "",
            "token_uri": "",
            "metadata_url": "",
            "image_uri": manifest_uri(source_image_url),
            "image_url": "",
            "name": str(record.get("name") or ""),
            "description": "",
            "attributes_json": "[]",
            "status": "",
            "error": "",
            "_bytes": b"",
        }
        try:
            local_session = requests.Session()
            local_session.headers.update(session.headers)
            image_url, jpg, width, height, source_format = fetch_first_image_bytes(
                local_session,
                image_uris,
                slug=collection.slug,
            )
            row.update(
                {
                    "width": width,
                    "height": height,
                    "source_format": source_format,
                    "image_url": manifest_uri(image_url),
                    "status": "ok",
                    "_bytes": jpg,
                }
            )
        except Exception as exc:  # noqa: BLE001 - kept in manifest.
            row.update({"status": "error", "error": short_error(exc)})
        return row

    all_rows: list[dict[str, Any]] = []
    failed = 0
    sha_lines: list[str] = []
    batches: list[tuple[str, list[int] | list[dict[str, Any]]]]
    if source_records:
        batches = source_batches(source_records, args.batch_size)
    else:
        batches = [
            (chunk_name(collection.slug, batch_ids[0], batch_ids[-1]), batch_ids)
            for batch_ids in (token_ids[index : index + args.batch_size] for index in range(0, len(token_ids), args.batch_size))
            if batch_ids
        ]

    for zip_file, batch_items in batches:
        zip_path = out_dir / zip_file
        if zip_path.exists() and not args.overwrite:
            print(f"exists {zip_file}", flush=True)
            continue

        rows: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            if source_records:
                future_map = {executor.submit(collect_one_from_source, record): record for record in batch_items}
            else:
                future_map = {executor.submit(collect_one, token_id): token_id for token_id in batch_items}
            for future in as_completed(future_map):
                row = future.result()
                row["zip_file"] = zip_file
                rows.append(row)
                if row["status"] == "ok":
                    print(f"ok {collection.slug} #{row['token_id']}", flush=True)
                else:
                    failed += 1
                    print(f"error {collection.slug} #{row['token_id']}: {row['error']}", flush=True)

        rows.sort(key=lambda item: int(item["token_id"]))
        if any(row["status"] != "ok" for row in rows):
            raise SystemExit(f"batch has failures; not writing {zip_path}")

        tmp_zip_path = zip_path.with_suffix(zip_path.suffix + ".tmp")
        tmp_zip_path.unlink(missing_ok=True)
        with zipfile.ZipFile(tmp_zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for row in rows:
                zf.writestr(str(row["image_filename"]), row["_bytes"])
                row.pop("_bytes", None)
            zf.writestr(
                "manifest_detail.csv",
                rows_to_csv(rows, row_fields()).encode("utf-8"),
            )
        tmp_zip_path.replace(zip_path)

        digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
        sha_lines.append(f"{digest}  {zip_file}")
        all_rows.extend(rows)
        print(f"wrote {zip_file} images={len(rows)}", flush=True)

    support_source_records = full_source_records if full_source_records and not args.allow_partial_source_batches else source_records

    if source_records:
        sha_lines = []
        for zip_file, _batch_items in source_batches(support_source_records, args.batch_size):
            zip_path = out_dir / zip_file
            if not zip_path.exists():
                raise SystemExit(f"missing expected zip after run: {zip_path}")
            digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
            sha_lines.append(f"{digest}  {zip_file}")

    manifest_path = out_dir / "manifest_simple.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["collection", "token_id", "image_filename", "zip_file"])
        writer.writeheader()
        simple_rows = support_source_records if source_records else all_rows
        for row in simple_rows:
            writer.writerow({field: row[field] for field in ["collection", "token_id", "image_filename", "zip_file"]})

    if sha_lines:
        (out_dir / "SHA256SUMS.txt").write_text("\n".join(sha_lines) + "\n", encoding="utf-8")
    (out_dir / "README.txt").write_text(
        f"{collection.name}\n\n"
        f"Images are grouped into {args.batch_size}-token zip files. Each image filename is the token id.\n"
        "manifest_simple.csv maps collection, token_id, image filename, and zip file.\n"
        "Each zip also contains manifest_detail.csv with metadata/image source audit fields.\n",
        encoding="utf-8",
    )

    print(f"done {collection.slug} rows={len(all_rows)} failed={failed} out={out_dir}")
    return 0 if failed == 0 else 2


def rows_to_csv(rows: list[dict[str, Any]], fields: list[str]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return out.getvalue()


if __name__ == "__main__":
    raise SystemExit(main())
