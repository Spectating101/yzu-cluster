#!/usr/bin/env python3
"""Fetch expanded public crypto research sources into raw_archives.

This collector is intentionally conservative:
- It stores raw responses before any transformation.
- It writes a per-run manifest with success/skip/error status.
- It skips credentialed sources when credentials are absent.
- It avoids unbounded crawls such as full Common Crawl WARC downloads.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import json
import os
import sys
import threading
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests


REPO = Path(__file__).resolve().parents[1]
DEFAULT_RAW = REPO / "data_lake/crypto_pipeline/news_context/raw_archives"
DEFAULT_MANIFEST_DIR = REPO / "data_lake/crypto_pipeline/news_context"
USER_AGENT = "Sharpe-Renaissance crypto-data-collector/1.0 research-contact=local@example.invalid"
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
_RATE_LIMIT_LOCK = threading.Lock()
_RATE_LIMIT_LAST: dict[str, float] = {}

MAJOR_COINMETRICS_ASSETS = [
    "btc",
    "eth",
    "sol",
    "xrp",
    "ada",
    "doge",
    "ltc",
    "bch",
    "link",
    "dot",
    "avax",
    "atom",
    "matic",
    "bnb",
    "trx",
    "fil",
    "near",
    "uni",
    "aave",
    "xmr",
]

COINMETRICS_METRIC_GROUPS = {
    "market": ["PriceUSD", "CapMrktCurUSD", "CapRealUSD", "VtyDayRet30d"],
    "usage": ["AdrActCnt", "TxCnt", "TxTfrCnt", "TxTfrValAdjUSD", "FeeTotUSD"],
    "supply": ["SplyCur", "SplyFF", "SplyAct1yr"],
    "network": ["HashRate", "DiffMean", "RevUSD"],
}

WIKIPEDIA_PAGES = {
    "bitcoin": "Bitcoin",
    "ethereum": "Ethereum",
    "solana": "Solana_(blockchain_platform)",
    "xrp": "XRP",
    "ripple": "Ripple_(payment_protocol)",
    "cardano": "Cardano_(blockchain_platform)",
    "dogecoin": "Dogecoin",
    "tron": "TRON_(cryptocurrency)",
    "binance": "Binance",
    "chainlink": "Chainlink_(blockchain)",
    "polkadot": "Polkadot_(cryptocurrency)",
    "litecoin": "Litecoin",
    "bitcoin_cash": "Bitcoin_Cash",
    "monero": "Monero",
    "avalanche": "Avalanche_(blockchain_platform)",
    "uniswap": "Uniswap",
    "aave": "Aave",
    "tether": "Tether_(cryptocurrency)",
    "usd_coin": "USD_Coin",
    "stablecoin": "Stablecoin",
    "defi": "Decentralized_finance",
    "nft": "Non-fungible_token",
}

SEC_CIKS = {
    "coinbase": "0001679788",
    "microstrategy": "0001050446",
    "marathon_digital": "0001507605",
    "riot_platforms": "0001167419",
    "cleanspark": "0000827876",
    "bitdeer": "0001899123",
    "iris_energy": "0001878848",
    "hut_8": "0001731805",
    "block": "0001512673",
    "paypal": "0001633917",
}

EXCHANGE_ANNOUNCEMENT_URLS = {
    "coinbase_asset_listing_policy": "https://www.coinbase.com/blog/update-to-asset-listing-announcements",
    "coinbase_blog": "https://www.coinbase.com/blog",
    "coinbase_exchange_blog": "https://www.coinbase.com/blog/landing/exchange",
    "binance_us_announcements": "https://support.binance.us/hc/en-us/sections/360011914954-Announcements",
    "binance_announcements_listing": "https://www.binance.com/en/support/announcement/c-48",
    "kraken_blog": "https://blog.kraken.com/",
    "okx_announcements": "https://www.okx.com/help/section/announcements-latest-announcements",
    "bybit_announcements": "https://announcements.bybit.com/",
}

COMMON_CRAWL_DOMAINS = [
    "coindesk.com",
    "cointelegraph.com",
    "decrypt.co",
    "dailyhodl.com",
    "cryptoslate.com",
    "bitcoin.com",
    "news.bitcoin.com",
]

DEFAULT_COMMON_CRAWL_IDS = [
    "CC-MAIN-2026-17",
    "CC-MAIN-2026-12",
    "CC-MAIN-2026-08",
    "CC-MAIN-2026-04",
    "CC-MAIN-2025-51",
    "CC-MAIN-2025-47",
    "CC-MAIN-2025-43",
    "CC-MAIN-2025-38",
    "CC-MAIN-2025-33",
    "CC-MAIN-2025-30",
    "CC-MAIN-2025-26",
    "CC-MAIN-2025-21",
]

GDELT_DOC_QUERIES = {
    "bitcoin": "bitcoin",
    "ethereum": "ethereum",
    "crypto": "crypto",
    "stablecoin": "stablecoin",
    "sec_bitcoin_etf": '"bitcoin ETF" SEC',
    "exchange_listing": '"exchange listing" cryptocurrency',
}

PROJECT_FEEDS = {
    "ethereum_blog": "https://blog.ethereum.org/feed.xml",
    "bitcoin_core": "https://bitcoincore.org/en/rss.xml",
    "chainlink_blog": "https://blog.chain.link/rss/",
    "solana_news": "https://solana.com/news/rss.xml",
}


@dataclass
class FetchTask:
    source_id: str
    name: str
    url: str
    out_path: Path
    kind: str = "file"
    required_env: str | None = None
    headers: dict[str, str] | None = None
    rate_limit_key: str | None = None
    rate_limit_seconds: float = 0.0


@dataclass
class FetchResult:
    source_id: str
    name: str
    url: str
    path: str
    status: str
    status_code: int | None = None
    bytes: int | None = None
    error: str | None = None
    ts: str = ""


def _now_run_id() -> str:
    return datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _respect_rate_limit(task: FetchTask) -> None:
    if not task.rate_limit_key or task.rate_limit_seconds <= 0:
        return
    with _RATE_LIMIT_LOCK:
        last = _RATE_LIMIT_LAST.get(task.rate_limit_key, 0.0)
        delay = task.rate_limit_seconds - (time.monotonic() - last)
        if delay > 0:
            time.sleep(delay)
        _RATE_LIMIT_LAST[task.rate_limit_key] = time.monotonic()


def _retry_delay(resp: requests.Response | None, attempt: int) -> float:
    if resp is not None:
        retry_after = resp.headers.get("Retry-After")
        if retry_after:
            try:
                return min(90.0, max(1.0, float(retry_after)))
            except ValueError:
                pass
    return min(90.0, 5.0 * (attempt + 1))


def _task(
    raw_dir: Path,
    run_id: str,
    source_id: str,
    name: str,
    url: str,
    filename: str,
    *,
    kind: str = "file",
    required_env: str | None = None,
    headers: dict[str, str] | None = None,
    rate_limit_key: str | None = None,
    rate_limit_seconds: float = 0.0,
) -> FetchTask:
    return FetchTask(
        source_id=source_id,
        name=name,
        url=url,
        out_path=raw_dir / source_id / run_id / filename,
        kind=kind,
        required_env=required_env,
        headers=headers,
        rate_limit_key=rate_limit_key,
        rate_limit_seconds=rate_limit_seconds,
    )


def build_defillama_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    endpoints = {
        "protocols": "https://api.llama.fi/protocols",
        "chains": "https://api.llama.fi/v2/chains",
        "historical_chain_tvl_all": "https://api.llama.fi/v2/historicalChainTvl",
        "stablecoins": "https://stablecoins.llama.fi/stablecoins?includePrices=true",
        "stablecoinchains": "https://stablecoins.llama.fi/stablecoinchains",
        "stablecoincharts_all": "https://stablecoins.llama.fi/stablecoincharts/all",
        "yields_pools": "https://yields.llama.fi/pools",
        "dexs_overview": "https://api.llama.fi/overview/dexs?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false",
        "fees_overview": "https://api.llama.fi/overview/fees?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false",
        "open_interest_overview": "https://api.llama.fi/overview/open-interest?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false",
        "hacks": "https://api.llama.fi/hacks",
    }
    return [
        _task(raw_dir, run_id, "defillama", name, url, f"{name}.json")
        for name, url in endpoints.items()
    ]


def build_coinmetrics_tasks(raw_dir: Path, run_id: str, start_time: str, end_time: str) -> list[FetchTask]:
    base = "https://community-api.coinmetrics.io/v4"
    tasks = [
        _task(raw_dir, run_id, "coinmetrics_community", "catalog_assets", f"{base}/catalog-all/assets?pretty=true", "catalog_assets.json"),
        _task(raw_dir, run_id, "coinmetrics_community", "catalog_asset_metrics", f"{base}/catalog-all/asset-metrics?pretty=true", "catalog_asset_metrics.json"),
    ]
    assets = ",".join(MAJOR_COINMETRICS_ASSETS)
    for group_name, metrics in COINMETRICS_METRIC_GROUPS.items():
        metric_text = ",".join(metrics)
        url = (
            f"{base}/timeseries/asset-metrics?assets={assets}&metrics={metric_text}"
            f"&frequency=1d&start_time={start_time}&end_time={end_time}"
            "&page_size=10000&format=json_stream&ignore_unsupported_errors=true&ignore_forbidden_errors=true"
        )
        tasks.append(
            _task(
                raw_dir,
                run_id,
                "coinmetrics_community",
                f"asset_metrics_{group_name}",
                url,
                f"asset_metrics_{group_name}_{start_time}_{end_time}.jsonl",
                kind="json_stream",
            )
        )
    return tasks


def build_wikimedia_tasks(raw_dir: Path, run_id: str, start: str, end: str) -> list[FetchTask]:
    tasks: list[FetchTask] = []
    base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user"
    for slug, page in WIKIPEDIA_PAGES.items():
        url = f"{base}/{quote(page, safe='')}/daily/{start}/{end}"
        tasks.append(_task(raw_dir, run_id, "wikimedia_pageviews", slug, url, f"{slug}_{start}_{end}.json", rate_limit_key="wikimedia", rate_limit_seconds=1.0))
    return tasks


def build_sec_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    tasks = [
        _task(raw_dir, run_id, "sec_edgar", "company_tickers", "https://www.sec.gov/files/company_tickers.json", "company_tickers.json"),
    ]
    for name, cik in SEC_CIKS.items():
        tasks.append(_task(raw_dir, run_id, "sec_edgar", f"submissions_{name}", f"https://data.sec.gov/submissions/CIK{cik}.json", f"submissions_{name}_{cik}.json"))
        tasks.append(_task(raw_dir, run_id, "sec_edgar", f"companyfacts_{name}", f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", f"companyfacts_{name}_{cik}.json", rate_limit_key="sec_edgar", rate_limit_seconds=0.15))
    return tasks


def build_exchange_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    return [
        _task(raw_dir, run_id, "exchange_announcements", name, url, f"{name}.html")
        for name, url in EXCHANGE_ANNOUNCEMENT_URLS.items()
    ]


def build_gdelt_doc_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    base = "https://api.gdeltproject.org/api/v2/doc/doc"
    tasks = []
    for name, query in GDELT_DOC_QUERIES.items():
        url = f"{base}?query={quote(query)}&mode=ArtList&format=json&maxrecords=250&sort=HybridRel&timespan=3months"
        tasks.append(_task(raw_dir, run_id, "gdelt_doc", name, url, f"{name}_3months.json", rate_limit_key="gdelt_doc", rate_limit_seconds=5.25))
    return tasks


def build_cryptopanic_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    tasks = [
        _task(raw_dir, run_id, "cryptopanic_live", "rss_public", "https://cryptopanic.com/news/rss/", "rss_public.xml"),
    ]
    token = os.getenv("CRYPTOPANIC_API_KEY")
    if token:
        tasks.append(
            _task(
                raw_dir,
                run_id,
                "cryptopanic_live",
                "api_posts",
                f"https://cryptopanic.com/api/v1/posts/?auth_token={token}&public=true",
                "api_posts.json",
            )
        )
    return tasks


def build_common_crawl_tasks(raw_dir: Path, run_id: str, crawl_ids: list[str]) -> list[FetchTask]:
    tasks = [
        _task(raw_dir, run_id, "common_crawl", "collinfo", "https://index.commoncrawl.org/collinfo.json", "collinfo.json")
    ]
    for crawl_id in crawl_ids:
        for domain in COMMON_CRAWL_DOMAINS:
            safe = domain.replace(".", "_")
            url = f"https://index.commoncrawl.org/{crawl_id}-index?url={quote(domain + '/*')}&output=json&filter=status:200&limit=1000"
            tasks.append(_task(raw_dir, run_id, "common_crawl", f"index_{domain}_{crawl_id}", url, f"{safe}_{crawl_id}_index.jsonl", kind="json_stream", rate_limit_key="common_crawl", rate_limit_seconds=0.1))
    return tasks


def build_github_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    repos = {
        "bitcoin_bitcoin": "bitcoin/bitcoin",
        "ethereum_go_ethereum": "ethereum/go-ethereum",
        "solana": "solana-labs/solana",
        "avax_avalanchego": "ava-labs/avalanchego",
        "chainlink": "smartcontractkit/chainlink",
        "uniswap_v3_core": "Uniswap/v3-core",
        "aave_v3_core": "aave-dao/aave-v3-origin",
    }
    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    tasks: list[FetchTask] = []
    for safe, repo in repos.items():
        tasks.append(_task(raw_dir, run_id, "github_activity", f"repo_{safe}", f"https://api.github.com/repos/{repo}", f"{safe}_repo.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"releases_{safe}", f"https://api.github.com/repos/{repo}/releases?per_page=100", f"{safe}_releases.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"commits_{safe}", f"https://api.github.com/repos/{repo}/commits?per_page=100", f"{safe}_commits.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"issues_{safe}", f"https://api.github.com/repos/{repo}/issues?state=all&per_page=100", f"{safe}_issues.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"pulls_{safe}", f"https://api.github.com/repos/{repo}/pulls?state=all&per_page=100", f"{safe}_pulls.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"contributors_{safe}", f"https://api.github.com/repos/{repo}/contributors?per_page=100", f"{safe}_contributors.json", headers=headers))
        tasks.append(_task(raw_dir, run_id, "github_activity", f"tags_{safe}", f"https://api.github.com/repos/{repo}/tags?per_page=100", f"{safe}_tags.json", headers=headers))
    return tasks


def build_project_feed_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    return [
        _task(raw_dir, run_id, "project_feeds", name, url, f"{name}.xml")
        for name, url in PROJECT_FEEDS.items()
    ]


def build_internet_archive_tasks(raw_dir: Path, run_id: str) -> list[FetchTask]:
    targets = {
        "coinbase_listing_policy": "https://www.coinbase.com/blog/update-to-asset-listing-announcements",
        "coinbase_blog": "https://www.coinbase.com/blog",
        "coinbase_exchange_blog": "https://www.coinbase.com/blog/landing/exchange",
        "binance_us_announcements": "https://support.binance.us/hc/en-us/sections/360011914954-Announcements",
        "binance_listing_announcements": "https://www.binance.com/en/support/announcement/c-48",
    }
    tasks = []
    for name, target in targets.items():
        url = (
            "https://web.archive.org/cdx"
            f"?url={quote(target, safe='')}&output=json&from=2018"
            "&fl=timestamp,original,statuscode,mimetype,digest&filter=statuscode:200&collapse=digest&limit=500"
        )
        tasks.append(_task(raw_dir, run_id, "internet_archive", name, url, f"{name}_cdx.json"))
    return tasks


def build_optional_credential_skips(raw_dir: Path, run_id: str) -> list[FetchTask]:
    return [
        _task(raw_dir, run_id, "coinmarketcal", "api_events", "https://developers.coinmarketcal.com/v1/events", "events.json", required_env="COINMARKETCAL_API_KEY"),
        _task(raw_dir, run_id, "reddit_api", "oauth_required", "https://oauth.reddit.com/r/CryptoCurrency/new", "reddit_new.json", required_env="REDDIT_BEARER_TOKEN"),
        _task(raw_dir, run_id, "x_api", "recent_search", "https://api.x.com/2/tweets/search/recent?query=crypto", "recent_search.json", required_env="X_BEARER_TOKEN"),
        _task(raw_dir, run_id, "telegram_public", "get_updates", "https://api.telegram.org/botTOKEN/getUpdates", "get_updates.json", required_env="TELEGRAM_BOT_TOKEN"),
        _task(raw_dir, run_id, "mediacloud", "api_search", "https://api.mediacloud.org/api/v2/stories_public/list", "search.json", required_env="MEDIACLOUD_API_KEY"),
    ]


def fetch_one(task: FetchTask, timeout: int, refresh: bool, retries: int) -> FetchResult:
    ts = datetime.now(UTC).isoformat()
    if task.required_env and not os.getenv(task.required_env):
        return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "skipped_missing_env", error=task.required_env, ts=ts)
    if task.out_path.exists() and task.out_path.stat().st_size > 0 and not refresh:
        return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "present", bytes=task.out_path.stat().st_size, ts=ts)

    task.out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = task.out_path.with_suffix(task.out_path.suffix + ".part")
    headers = {"User-Agent": USER_AGENT, **(task.headers or {})}
    max_attempts = max(1, retries)
    last_error = None
    for attempt in range(max_attempts):
        _respect_rate_limit(task)
        try:
            with requests.get(task.url, headers=headers, stream=True, timeout=timeout) as resp:
                status_code = resp.status_code
                if status_code >= 400:
                    body = resp.text[:500]
                    if status_code in RETRY_STATUS_CODES and attempt + 1 < max_attempts:
                        last_error = body
                        time.sleep(_retry_delay(resp, attempt))
                        continue
                    return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "http_error", status_code=status_code, error=body, ts=ts)
                with tmp.open("wb") as fh:
                    for chunk in resp.iter_content(chunk_size=1 << 20):
                        if chunk:
                            fh.write(chunk)
                tmp.replace(task.out_path)
            return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "downloaded", status_code=status_code, bytes=task.out_path.stat().st_size, ts=ts)
        except Exception as exc:
            last_error = str(exc)
            try:
                if tmp.exists():
                    tmp.unlink()
            except Exception:
                pass
            if attempt + 1 < max_attempts:
                time.sleep(_retry_delay(None, attempt))
                continue
            return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "error", error=str(exc), ts=ts)
    return FetchResult(task.source_id, task.name, task.url, str(task.out_path), "error", error=last_error, ts=ts)


def build_tasks(args: argparse.Namespace, run_id: str) -> list[FetchTask]:
    raw_dir = args.raw_dir
    tasks: list[FetchTask] = []
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    wiki_end = datetime.now(UTC).strftime("%Y%m%d00")
    common_crawl_ids = [crawl_id.strip() for crawl_id in args.common_crawl_ids.split(",") if crawl_id.strip()]
    if args.include_defillama:
        tasks.extend(build_defillama_tasks(raw_dir, run_id))
    if args.include_coinmetrics:
        tasks.extend(build_coinmetrics_tasks(raw_dir, run_id, args.start_date, today))
    if args.include_wikimedia:
        tasks.extend(build_wikimedia_tasks(raw_dir, run_id, "2015070100", wiki_end))
    if args.include_sec:
        tasks.extend(build_sec_tasks(raw_dir, run_id))
    if args.include_exchange:
        tasks.extend(build_exchange_tasks(raw_dir, run_id))
    if args.include_gdelt_doc:
        tasks.extend(build_gdelt_doc_tasks(raw_dir, run_id))
    if args.include_cryptopanic:
        tasks.extend(build_cryptopanic_tasks(raw_dir, run_id))
    if args.include_common_crawl:
        tasks.extend(build_common_crawl_tasks(raw_dir, run_id, common_crawl_ids))
    if args.include_github:
        tasks.extend(build_github_tasks(raw_dir, run_id))
    if args.include_project_feeds:
        tasks.extend(build_project_feed_tasks(raw_dir, run_id))
    if args.include_internet_archive:
        tasks.extend(build_internet_archive_tasks(raw_dir, run_id))
    if args.include_credentialed:
        tasks.extend(build_optional_credential_skips(raw_dir, run_id))
    return tasks


def write_manifest(manifest_dir: Path, run_id: str, results: list[FetchResult], tasks: list[FetchTask]) -> Path:
    manifest_dir.mkdir(parents=True, exist_ok=True)
    path = manifest_dir / f"expanded_source_manifest_{run_id}.json"
    payload = {
        "run_id": run_id,
        "generated_at": datetime.now(UTC).isoformat(),
        "task_count": len(tasks),
        "status_counts": dict(sorted({r.status: sum(1 for x in results if x.status == r.status) for r in results}.items())),
        "results": [asdict(r) for r in results],
    }
    _write_json(path, payload)

    csv_path = manifest_dir / f"expanded_source_manifest_{run_id}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(asdict(results[0]).keys()) if results else ["source_id", "name", "url", "path", "status"])
        writer.writeheader()
        for result in results:
            writer.writerow(asdict(result))
    return path


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Fetch expanded public crypto data sources.")
    ap.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW)
    ap.add_argument("--manifest-dir", type=Path, default=DEFAULT_MANIFEST_DIR)
    ap.add_argument("--run-id", default=_now_run_id())
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--retries", type=int, default=4)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--start-date", default="2010-01-01")
    ap.add_argument("--common-crawl-ids", default=",".join(DEFAULT_COMMON_CRAWL_IDS))

    ap.add_argument("--include-defillama", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-coinmetrics", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-wikimedia", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-sec", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-exchange", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-gdelt-doc", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-cryptopanic", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-common-crawl", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-github", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-project-feeds", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-internet-archive", action=argparse.BooleanOptionalAction, default=True)
    ap.add_argument("--include-credentialed", action=argparse.BooleanOptionalAction, default=True)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    tasks = build_tasks(args, args.run_id)
    print(json.dumps({"run_id": args.run_id, "tasks": len(tasks), "raw_dir": str(args.raw_dir)}, indent=2), file=sys.stderr)
    results: list[FetchResult] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(fetch_one, task, args.timeout, args.refresh, args.retries): task for task in tasks}
        for fut in concurrent.futures.as_completed(futures):
            result = fut.result()
            results.append(result)
            print(f"[{result.status}] {result.source_id}/{result.name} bytes={result.bytes or 0}", file=sys.stderr)
            time.sleep(0.05)
    results.sort(key=lambda r: (r.source_id, r.name))
    manifest = write_manifest(args.manifest_dir, args.run_id, results, tasks)
    print(json.dumps({"manifest": str(manifest), "status_counts": dict(sorted({r.status: sum(1 for x in results if x.status == r.status) for r in results}.items()))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
