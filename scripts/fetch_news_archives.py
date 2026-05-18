"""Download external news/news-impact archives for local research use.

This script is intentionally write-once/re-run safe:
- It can re-run without redownloading files that already exist.
- It writes manifest files so every downloaded object is auditable.
- It avoids any transformation work so raw data remains reproducible.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit

import requests

try:
    from requests.packages.urllib3.exceptions import InsecureRequestWarning
except Exception:  # pragma: no cover - requests package shape can vary in edge environments
    class InsecureRequestWarning(Warning):
        pass


DEFAULT_OUT_DIR = Path("data_lake/crypto_pipeline/news_context/raw_archives")
DEFAULT_GDELT_OUT_DIR = DEFAULT_OUT_DIR / "gdelt"
USER_AGENT = "Mozilla/5.0 news-archive-fetcher/1.0"
HF_REPOS = [
    "ExponentialScience/DLT-Sentiment-News",
    "sovai/news_sentiment",
    "xesutr/crypto_news_augmented_dataset",
    "StephanAkkerman/financial-tweets-crypto",
    "aaurelions/cryptocurrency-tweets-sentiment",
    "Gopher-Lab/Crypto_AltSeason_Sentiment_X_Twitter",
    "danilocorsi/LLMs-Sentiment-Augmented-Bitcoin-Dataset",
    "modestus/bitcoin_sentiment_analysis",
    "Instrumetriq/crypto-market-sentiment-observations",
    "FISA-conclave/news-sentiment-dataset",
    "raeidsaqur/NIFTY",
]
KAGGLE_DATASETS = [
    "oliviervha/crypto-news",
    "kaballa/cryptoner-ml-model",
    "aaroncbastian/crypto-news-headlines-and-market-prices-by-date",
]
MENDELEY_DATASETS = [
    "wvjjxr8bxx",
]
FIGSHARE_ARTICLES = [
    "21989735",
]


@dataclass
class DownloadItem:
    url: str
    out_path: Path
    etag: str | None = None
    size: int | None = None
    source_name: str | None = None
    item_type: str | None = None


def _safe_name(url: str) -> str:
    return url.split("/")[-1]


def _hf_dataset_from_url(url: str) -> str:
    parts = [part for part in urlsplit(url).path.split("/") if part]
    if len(parts) >= 3:
        return "/".join(parts[:3])
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return ""


def _gdelt_file_type(url: str) -> str:
    if ".export.CSV.zip" in url:
        return "export"
    if ".mentions.CSV.zip" in url:
        return "mentions"
    return "unknown"


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def download_file(url: str, out_path: Path, timeout: int = 60, verify_ssl: bool = True, retries: int = 3) -> bool:
    """Download a single URL to `out_path` with retries.

    Returns:
      True if file was downloaded successfully or already existed.
    """
    _ensure_parent(out_path)
    if out_path.exists() and out_path.stat().st_size > 0:
        return True

    headers = {"User-Agent": USER_AGENT}
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with requests.get(url, headers=headers, stream=True, timeout=timeout, verify=verify_ssl) as resp:
                resp.raise_for_status()
                if out_path.exists() and out_path.stat().st_size > 0:
                    return True
                if out_path.with_suffix(out_path.suffix + ".part").exists():
                    out_path.with_suffix(out_path.suffix + ".part").unlink()
                tmp = out_path.with_name(f"{out_path.name}.part")
                with tmp.open("wb") as fh:
                    for chunk in resp.iter_content(chunk_size=1 << 20):
                        if chunk:
                            fh.write(chunk)
                tmp.replace(out_path)
            return True
        except Exception as exc:  # pragma: no cover - network-dependent
            last_err = exc
            print(f"[warn] failed {url} (attempt {attempt}/{retries}): {exc}", file=sys.stderr)
            time.sleep(1.5 * attempt)

    print(f"[error] failed after {retries} attempts: {url}", file=sys.stderr)
    if last_err:
        print(f"[error] last error: {last_err}", file=sys.stderr)
    return False


def download_batch(items: Iterable[DownloadItem], max_workers: int = 6) -> list[DownloadItem]:
    items = list(items)
    if not items:
        return []

    ok: list[DownloadItem] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(download_file, it.url, it.out_path, verify_ssl=False if it.url.startswith("https://data.gdeltproject.org") else True): it
            for it in items
        }
        for fut in concurrent.futures.as_completed(futures):
            item = futures[fut]
            try:
                if fut.result():
                    ok.append(item)
                else:
                    print(f"[warn] download returned false: {item.url}", file=sys.stderr)
            except Exception as exc:
                print(f"[error] unhandled error for {item.url}: {exc}", file=sys.stderr)
    return ok


def _fetch_masterfilelist(out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    url = "https://data.gdeltproject.org/gdeltv2/masterfilelist.txt"
    txt = out_path
    if txt.exists() and (time.time() - txt.stat().st_mtime) < 3600:
        return txt

    try:
        with requests.get(url, stream=True, timeout=40, verify=False) as resp:
            resp.raise_for_status()
            txt.write_bytes(resp.content)
    except Exception as exc:
        raise RuntimeError(f"could not fetch {url}: {exc}") from exc
    return txt


def build_gdelt_items(days: int, out_dir: Path, master_path: Path) -> tuple[list[DownloadItem], dict[str, list[str]]]:
    if days <= 0:
        raise ValueError("--gdelt-days must be > 0")
    _fetch_masterfilelist(master_path)
    lines = master_path.read_text(encoding="utf-8", errors="ignore").splitlines()

    row_re = re.compile(
        r"^(?P<size>\d+)\s+[0-9a-f]+\s+(?P<url>https?://data\.gdeltproject\.org/gdeltv2/(?P<stamp>\d{14})\.(?P<kind>export|mentions)\.CSV\.zip)$"
    )
    rows: list[tuple[datetime, str, str, int]] = []
    for line in lines:
        m = row_re.match(line.strip())
        if not m:
            continue
        rows.append((datetime.strptime(m.group("stamp"), "%Y%m%d%H%M%S"), m.group("kind"), m.group("url"), int(m.group("size"))))

    if not rows:
        raise RuntimeError("no gdelt rows parsed; masterfilelist format may have changed")

    rows.sort(key=lambda r: r[0], reverse=True)
    latest = rows[0][0]
    start = latest - timedelta(days=days)
    selected = [(ts, kind, url, size) for ts, kind, url, size in rows if ts >= start]

    counters: dict[str, list[str]] = {"export": [], "mentions": []}
    items: list[DownloadItem] = []
    for ts, kind, url, size in selected:
        safe = _safe_name(url)
        counters[kind].append(safe)
        items.append(DownloadItem(url=url, out_path=out_dir / kind / safe, size=size))

    return items, counters


def _download_hf_dataset(url: str, out_dir: Path, name: str) -> list[DownloadItem]:
    return [
        DownloadItem(url, out_dir / name, source_name=_hf_dataset_from_url(url), item_type="file"),
    ]


def _repo_dir_name(repo: str) -> str:
    return repo.replace("/", "__")


def build_hf_repo_items(repos: Iterable[str], out_dir: Path) -> list[DownloadItem]:
    items: list[DownloadItem] = []
    headers = {"User-Agent": USER_AGENT}
    for repo in repos:
        api_url = f"https://huggingface.co/api/datasets/{repo}/tree/main?recursive=true&expand=true"
        try:
            resp = requests.get(api_url, headers=headers, timeout=45)
            resp.raise_for_status()
        except Exception as exc:
            print(f"[warn] could not inspect huggingface repo {repo}: {exc}", file=sys.stderr)
            continue

        for entry in resp.json():
            if entry.get("type") != "file":
                continue
            path = str(entry.get("path") or "").strip()
            if not path:
                continue
            url = f"https://huggingface.co/datasets/{repo}/resolve/main/{path}"
            items.append(
                DownloadItem(
                    url=url,
                    out_path=out_dir / "huggingface" / _repo_dir_name(repo) / path,
                    size=entry.get("size"),
                    source_name=repo,
                    item_type="file",
                )
            )
    return items


def build_kaggle_items(slugs: Iterable[str], out_dir: Path) -> list[DownloadItem]:
    items: list[DownloadItem] = []
    headers = {"User-Agent": USER_AGENT}
    for slug in slugs:
        list_url = f"https://www.kaggle.com/api/v1/datasets/list?search={slug.split('/')[-1]}"
        size = None
        try:
            resp = requests.get(list_url, headers=headers, timeout=30)
            if resp.ok:
                for entry in resp.json():
                    if entry.get("ref") == slug or entry.get("urlNullable", "").rstrip("/").endswith(slug):
                        size = entry.get("totalBytesNullable")
                        break
        except Exception as exc:
            print(f"[warn] could not inspect kaggle metadata {slug}: {exc}", file=sys.stderr)

        items.append(
            DownloadItem(
                url=f"https://www.kaggle.com/api/v1/datasets/download/{slug}",
                out_path=out_dir / "kaggle" / f"{_repo_dir_name(slug)}.zip",
                size=size,
                source_name=slug,
                item_type="archive_zip",
            )
        )
    return items


def build_mendeley_items(dataset_ids: Iterable[str], out_dir: Path) -> list[DownloadItem]:
    items: list[DownloadItem] = []
    headers = {"User-Agent": USER_AGENT}
    for dataset_id in dataset_ids:
        api_url = f"https://data.mendeley.com/public-api/datasets/{dataset_id}"
        try:
            resp = requests.get(api_url, headers=headers, timeout=45)
            resp.raise_for_status()
        except Exception as exc:
            print(f"[warn] could not inspect mendeley dataset {dataset_id}: {exc}", file=sys.stderr)
            continue
        for entry in resp.json().get("files", []):
            filename = entry.get("filename") or entry.get("id")
            details = entry.get("content_details") or {}
            url = details.get("download_url")
            if not filename or not url:
                continue
            items.append(
                DownloadItem(
                    url=url,
                    out_path=out_dir / "mendeley" / dataset_id / str(filename),
                    size=entry.get("size") or details.get("size"),
                    source_name=dataset_id,
                    item_type="file",
                )
            )
    return items


def build_figshare_items(article_ids: Iterable[str], out_dir: Path) -> list[DownloadItem]:
    items: list[DownloadItem] = []
    headers = {"User-Agent": USER_AGENT}
    for article_id in article_ids:
        api_url = f"https://api.figshare.com/v2/articles/{article_id}"
        try:
            resp = requests.get(api_url, headers=headers, timeout=45)
            resp.raise_for_status()
        except Exception as exc:
            print(f"[warn] could not inspect figshare article {article_id}: {exc}", file=sys.stderr)
            continue
        for entry in resp.json().get("files", []):
            filename = entry.get("name") or str(entry.get("id"))
            url = entry.get("download_url")
            if not filename or not url:
                continue
            items.append(
                DownloadItem(
                    url=url,
                    out_path=out_dir / "figshare" / article_id / str(filename),
                    size=entry.get("size"),
                    source_name=article_id,
                    item_type="file",
                )
            )
    return items


def write_manifest(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def _path_has_data(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def _manifest_status(path: Path, dry_run: bool) -> str:
    if _path_has_data(path):
        return "present"
    return "planned" if dry_run else "downloaded"


def _append_manifest(
    manifest_records: list[dict[str, object]],
    source: str,
    it: DownloadItem,
    dry_run: bool,
    kind: str | None = None,
) -> None:
    record: dict[str, object] = {
        "source": source,
        "source_name": it.source_name,
        "url": it.url,
        "path": str(it.out_path),
        "size_bytes": it.size,
        "status": _manifest_status(it.out_path, dry_run),
        "ts": datetime.now(UTC).isoformat(),
    }
    if source == "huggingface":
        record["source_dataset"] = it.source_name or _hf_dataset_from_url(it.url)
    if it.item_type:
        record["item_type"] = it.item_type
    if kind:
        record["type"] = kind
    manifest_records.append(record)


def run(args: argparse.Namespace) -> int:
    warnings.filterwarnings("ignore", category=InsecureRequestWarning)
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_records: list[dict[str, object]] = []

    # 1) External Hugging Face crypto/news datasets
    if args.fetch_hf:
        hf_items = _download_hf_dataset(
            "https://huggingface.co/datasets/maryamfakhari/crypto-news-coindesk-2020-2025/resolve/main/coindesk-crypto-news-2020-2025.csv",
            out_dir / "huggingface",
            "coindesk-crypto-news-2020-2025.csv",
        )
        hf_items += _download_hf_dataset(
            "https://huggingface.co/datasets/maryamfakhari/CryptoNewsImpact/resolve/main/news_impact_deepseek.csv",
            out_dir / "huggingface",
            "news_impact_deepseek.csv",
        )
        hf_items += _download_hf_dataset(
            "https://huggingface.co/datasets/maryamfakhari/CryptoNewsImpact/resolve/main/news_impact_llama.csv",
            out_dir / "huggingface",
            "news_impact_llama.csv",
        )
        hf_items += _download_hf_dataset(
            "https://huggingface.co/datasets/maryamfakhari/crypto-news-coindesk-2020-2025/raw/main/README.md",
            out_dir / "huggingface",
            "README_coindesk_crypto_news_2020_2025.md",
        )

        if args.dry_run:
            print(f"[info] dry-run hf datasets selected: {len(hf_items)} files", file=sys.stderr)
            for it in hf_items:
                _append_manifest(manifest_records, "huggingface", it, dry_run=True)
        else:
            for it in download_batch(hf_items, max_workers=3):
                _append_manifest(manifest_records, "huggingface", it, dry_run=False)

    # 2) Additional public archives with direct metadata/download APIs.
    if args.fetch_hf_extra:
        hf_extra_items = build_hf_repo_items(HF_REPOS, out_dir)
        print(f"[info] huggingface extra selected files: {len(hf_extra_items)}", file=sys.stderr)
        if args.dry_run:
            for it in hf_extra_items:
                _append_manifest(manifest_records, "huggingface", it, dry_run=True)
        else:
            for it in download_batch(hf_extra_items, max_workers=args.archive_workers):
                _append_manifest(manifest_records, "huggingface", it, dry_run=False)

    if args.fetch_kaggle:
        kaggle_items = build_kaggle_items(KAGGLE_DATASETS, out_dir)
        print(f"[info] kaggle selected archives: {len(kaggle_items)}", file=sys.stderr)
        if args.dry_run:
            for it in kaggle_items:
                _append_manifest(manifest_records, "kaggle", it, dry_run=True)
        else:
            for it in download_batch(kaggle_items, max_workers=min(args.archive_workers, 3)):
                _append_manifest(manifest_records, "kaggle", it, dry_run=False)

    if args.fetch_mendeley:
        mendeley_items = build_mendeley_items(MENDELEY_DATASETS, out_dir)
        print(f"[info] mendeley selected files: {len(mendeley_items)}", file=sys.stderr)
        if args.dry_run:
            for it in mendeley_items:
                _append_manifest(manifest_records, "mendeley", it, dry_run=True)
        else:
            for it in download_batch(mendeley_items, max_workers=min(args.archive_workers, 2)):
                _append_manifest(manifest_records, "mendeley", it, dry_run=False)

    if args.fetch_figshare:
        figshare_items = build_figshare_items(FIGSHARE_ARTICLES, out_dir)
        print(f"[info] figshare selected files: {len(figshare_items)}", file=sys.stderr)
        if args.dry_run:
            for it in figshare_items:
                _append_manifest(manifest_records, "figshare", it, dry_run=True)
        else:
            for it in download_batch(figshare_items, max_workers=min(args.archive_workers, 2)):
                _append_manifest(manifest_records, "figshare", it, dry_run=False)

    # 3) GDELT pull (events + mentions in recent window)
    if args.fetch_gdelt:
        print(f"[info] building gdelt windows for last {args.gdelt_days} days", file=sys.stderr)
        gdelt_out = DEFAULT_GDELT_OUT_DIR / "window"
        gdelt_master = out_dir / "gdelt" / "masterfilelist.txt"
        items, counters = build_gdelt_items(args.gdelt_days, gdelt_out, gdelt_master)
        if args.dry_run:
            print(
                f"[info] dry-run gdelt window selected: export={len(counters['export'])} mentions={len(counters['mentions'])}",
                file=sys.stderr,
            )
            for it in items:
                _append_manifest(
                    manifest_records,
                    "gdelt",
                    it,
                    dry_run=True,
                    kind=_gdelt_file_type(it.url),
                )
        else:
            for it in download_batch(items, max_workers=args.gdelt_workers):
                _append_manifest(
                    manifest_records,
                    "gdelt",
                    it,
                    dry_run=False,
                    kind=_gdelt_file_type(it.url),
                )
        print(
            f"[info] gdelt selected files: export={len(counters['export'])} mentions={len(counters['mentions'])}",
            file=sys.stderr,
        )

    manifest_path = out_dir / "archive_manifest.json"
    write_manifest(manifest_path, manifest_records)
    print(f"[info] wrote manifest: {manifest_path}")
    return 0


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Download external news archives for analysis research.")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--fetch-gdelt", action="store_true", default=True)
    ap.add_argument("--no-fetch-gdelt", dest="fetch_gdelt", action="store_false")
    ap.add_argument("--gdelt-days", type=int, default=14, help="Download gdelt export+mentions for past N days.")
    ap.add_argument("--gdelt-workers", type=int, default=6)
    ap.add_argument("--fetch-hf", action="store_true", default=True)
    ap.add_argument("--no-fetch-hf", dest="fetch_hf", action="store_false")
    ap.add_argument("--fetch-hf-extra", action="store_true", default=True)
    ap.add_argument("--no-fetch-hf-extra", dest="fetch_hf_extra", action="store_false")
    ap.add_argument("--fetch-kaggle", action="store_true", default=True)
    ap.add_argument("--no-fetch-kaggle", dest="fetch_kaggle", action="store_false")
    ap.add_argument("--fetch-mendeley", action="store_true", default=True)
    ap.add_argument("--no-fetch-mendeley", dest="fetch_mendeley", action="store_false")
    ap.add_argument("--fetch-figshare", action="store_true", default=True)
    ap.add_argument("--no-fetch-figshare", dest="fetch_figshare", action="store_false")
    ap.add_argument("--archive-workers", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true", help="Only print selected file counts, do not download.")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    if args.dry_run:
        print("[info] dry run requested; skipping downloads", file=sys.stderr)
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
