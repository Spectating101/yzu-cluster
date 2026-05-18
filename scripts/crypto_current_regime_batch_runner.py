#!/usr/bin/env python3
"""
Crypto Current Regime Batch Runner

Runs unattended Gemini browse batches for the high-priority current-regime queue.
Each cycle:

1. Merges all direct-browsed batch artifacts into a single master panel.
2. Refreshes the full-universe current-regime scaleout from that master panel.
3. Takes the next high-priority tranche.
4. Runs Gemini enrichment for that tranche with resumable checkpoints.
5. Repeats until the high-priority queue is empty or a configured limit is hit.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


_HERE = Path(__file__).resolve()
_REPO = _HERE.parents[1]
DEFAULT_CONTEXT_DIR = _REPO / "data_lake" / "crypto_pipeline" / "context"
DEFAULT_INPUT_CSV = DEFAULT_CONTEXT_DIR / "quality_floor_universe_labels.csv"
DEFAULT_QUEUE_PATH = DEFAULT_CONTEXT_DIR / "current_regime_browse_priority_high_ids.txt"
DEFAULT_STATE_PATH = DEFAULT_CONTEXT_DIR / "current_regime_auto_runner_state.json"

ENRICHMENT_SCRIPT = _HERE.with_name("crypto_current_regime_enrichment.py")
SCALEOUT_SCRIPT = _HERE.with_name("crypto_current_regime_scaleout.py")

TOP500_SUMMARY = "current_regime_top500_summary.csv"
TOP500_JSON = "current_regime_top500.json"
MASTER_SUMMARY = "current_regime_browsed_master_summary.csv"
MASTER_JSON = "current_regime_browsed_master.json"
HIGH_BATCH_RE = re.compile(r"^current_regime_high_batch(\d+)_ids\.txt$")
HIGH_BATCH_SUMMARY_RE = re.compile(r"^current_regime_high_batch(\d+)_summary\.csv$")
QUOTA_RESET_RE = re.compile(r"quota will reset after ([0-9hms]+)", re.IGNORECASE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _log(message: str) -> None:
    print(f"[{_now_iso()}] {message}", flush=True)


def _load_ids(path: Path) -> list[str]:
    if not path.exists():
        return []
    seen: set[str] = set()
    ids: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        coin_id = line.strip()
        if coin_id and coin_id not in seen:
            seen.add(coin_id)
            ids.append(coin_id)
    return ids


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _count_summary_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        try:
            next(reader)
        except StopIteration:
            return 0
        return sum(1 for _ in reader)


def _discover_browsed_summary_paths(context_dir: Path) -> list[Path]:
    paths: list[Path] = []
    top500 = context_dir / TOP500_SUMMARY
    if top500.exists():
        paths.append(top500)
    master = context_dir / MASTER_SUMMARY
    if master.exists():
        paths.append(master)
    paths.extend(sorted(context_dir.glob("current_regime_high_batch*_summary.csv")))
    return paths


def _discover_browsed_json_paths(context_dir: Path) -> list[Path]:
    paths: list[Path] = []
    top500 = context_dir / TOP500_JSON
    if top500.exists():
        paths.append(top500)
    master = context_dir / MASTER_JSON
    if master.exists():
        paths.append(master)
    paths.extend(sorted(context_dir.glob("current_regime_high_batch*.json")))
    return paths


def _merge_browsed_outputs(context_dir: Path, last_merged_batch: str = "") -> tuple[Path, Path, int]:
    summary_paths = _discover_browsed_summary_paths(context_dir)
    if not summary_paths:
        raise SystemExit("No browsed current-regime summary files found to merge.")

    # Load existing master if available for incremental merge
    master_csv = context_dir / MASTER_SUMMARY
    rows_by_id: dict[str, dict[str, str]] = {}
    
    if last_merged_batch and master_csv.exists():
        # Incremental: load existing master
        for row in _read_csv_rows(master_csv):
            coin_id = row.get("coingecko_id", "").strip()
            if coin_id:
                rows_by_id[coin_id] = row
        
        # Only process new batches
        for path in summary_paths:
            batch_name = path.stem
            if batch_name > last_merged_batch:  # Lexical comparison works for batch naming
                for row in _read_csv_rows(path):
                    coin_id = row.get("coingecko_id", "").strip()
                    if coin_id:
                        rows_by_id[coin_id] = row
    else:
        # Full merge: process all paths
        for path in summary_paths:
            for row in _read_csv_rows(path):
                coin_id = row.get("coingecko_id", "").strip()
                if coin_id:
                    rows_by_id[coin_id] = row

    ordered_rows = sorted(rows_by_id.values(), key=lambda row: int(float(row["rank_idx"])))
    if not ordered_rows:
        raise SystemExit("No valid rows found after merge.")
    
    master_csv = context_dir / MASTER_SUMMARY
    
    # Dynamically collect all fieldnames from rows (handles new fields from enrichment updates)
    all_fields = set()
    for row in ordered_rows:
        all_fields.update(row.keys())
    
    # Order fieldnames logically (common fields first, then alphabetical for the rest)
    priority_fields = ["coingecko_id", "symbol", "name", "rank_idx", "predicted_bucket", 
                      "bucket_confidence", "signal_families_preview", "current_primary_driver", 
                      "current_primary_risk"]
    ordered_fieldnames = [f for f in priority_fields if f in all_fields]
    remaining = sorted(all_fields - set(ordered_fieldnames))
    ordered_fieldnames.extend(remaining)
    
    with master_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=ordered_fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(ordered_rows)

    json_by_id: dict[str, dict[str, Any]] = {}
    for path in _discover_browsed_json_paths(context_dir):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for row in payload.get("coins", []):
            coin_id = str(row.get("coingecko_id", "")).strip()
            if coin_id:
                json_by_id[coin_id] = row

    ordered_json_rows = sorted(json_by_id.values(), key=lambda row: int(row["rank_idx"]))
    master_json = context_dir / MASTER_JSON
    master_json.write_text(json.dumps({"coins": ordered_json_rows}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return master_csv, master_json, len(ordered_rows)


def _refresh_scaleout(repo_root: Path, master_csv: Path) -> None:
    cmd = [
        sys.executable,
        str(SCALEOUT_SCRIPT),
        "--current-panel-csv",
        str(master_csv),
    ]
    result = subprocess.run(cmd, cwd=repo_root, stdin=subprocess.DEVNULL, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Scaleout refresh failed with code {result.returncode}")


def _batch_prefix_from_ids_path(ids_path: Path) -> str:
    if not ids_path.stem.endswith("_ids"):
        raise RuntimeError(f"Unexpected batch ids filename: {ids_path.name}")
    return ids_path.stem[:-4]


def _find_incomplete_batch(context_dir: Path) -> Path | None:
    for ids_path in sorted(context_dir.glob("current_regime_high_batch*_ids.txt")):
        expected = len(_load_ids(ids_path))
        if expected == 0:
            continue
        prefix = _batch_prefix_from_ids_path(ids_path)
        summary_path = context_dir / f"{prefix}_summary.csv"
        if _count_summary_rows(summary_path) < expected:
            return ids_path
    return None


def _next_batch_number(context_dir: Path) -> int:
    max_seen = 0
    for path in context_dir.glob("current_regime_high_batch*_summary.csv"):
        match = HIGH_BATCH_SUMMARY_RE.match(path.name)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    return max_seen + 1


def _write_batch_ids(ids_path: Path, coin_ids: list[str]) -> None:
    ids_path.write_text("\n".join(coin_ids) + ("\n" if coin_ids else ""), encoding="utf-8")


def _parse_duration_s(text: str) -> float | None:
    cleaned = text.strip().lower().rstrip(".")
    match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", cleaned)
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    total = hours * 3600 + minutes * 60 + seconds
    return float(total) if total > 0 else None


def _extract_quota_reset_delay_s(output: str) -> float | None:
    if "TerminalQuotaError" not in output:
        return None
    match = QUOTA_RESET_RE.search(output)
    if not match:
        return None
    return _parse_duration_s(match.group(1))


def _run_enrichment(repo_root: Path, input_csv: Path, ids_path: Path, prefix: str, inner_batch_size: int) -> tuple[int, str]:
    cmd = [
        sys.executable,
        str(ENRICHMENT_SCRIPT),
        "--input-csv",
        str(input_csv),
        "--coin-ids-file",
        str(ids_path),
        "--batch-size",
        str(inner_batch_size),
        "--output-prefix",
        prefix,
    ]
    result = subprocess.run(
        cmd,
        cwd=repo_root,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )
    combined = (result.stdout or "") + (result.stderr or "")
    if combined.strip():
        print(combined.rstrip(), flush=True)
    return result.returncode, combined


def _write_state(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(payload)
    payload["updated_at"] = _now_iso()
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Run unattended high-priority Gemini browse batches.")
    ap.add_argument("--repo-root", type=Path, default=_REPO)
    ap.add_argument("--context-dir", type=Path, default=DEFAULT_CONTEXT_DIR)
    ap.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV)
    ap.add_argument("--queue-path", type=Path, default=DEFAULT_QUEUE_PATH)
    ap.add_argument("--state-path", type=Path, default=DEFAULT_STATE_PATH)
    ap.add_argument("--batch-size", type=int, default=40)
    ap.add_argument("--inner-batch-size", type=int, default=4)
    ap.add_argument("--max-batches", type=int, default=0, help="0 means no limit.")
    ap.add_argument("--retry-delay-s", type=float, default=15.0)
    ap.add_argument("--max-failures-per-batch", type=int, default=5)
    ap.add_argument("--sleep-between-batches-s", type=float, default=2.0)
    return ap


def main() -> int:
    args = _build_parser().parse_args()
    repo_root = args.repo_root.resolve()
    context_dir = args.context_dir.resolve()
    queue_path = args.queue_path.resolve()
    input_csv = args.input_csv.resolve()
    state_path = args.state_path.resolve()

    run_state: dict[str, Any] = {
        "status": "starting",
        "started_at": _now_iso(),
        "processed_batches_this_run": 0,
        "last_completed_batch_prefix": "",
        "current_batch_prefix": "",
        "direct_browsed_rows": 0,
        "remaining_high_ids": 0,
        "last_error": "",
        "quota_wait_until": "",
        "last_merged_batch": "",
    }
    _write_state(state_path, run_state)

    _log("Bootstrapping browsed master merge.")
    last_merged = ""  # Start with full merge on bootstrap
    master_csv, _, browsed_count = _merge_browsed_outputs(context_dir, last_merged)
    _refresh_scaleout(repo_root, master_csv)
    high_ids = _load_ids(queue_path)
    run_state.update(
        {
            "status": "running",
            "direct_browsed_rows": browsed_count,
            "remaining_high_ids": len(high_ids),
        }
    )
    _write_state(state_path, run_state)
    _log(f"Bootstrapped browsed master with {browsed_count} direct rows; remaining high-priority ids={len(high_ids)}")

    while high_ids:
        resume_ids_path = _find_incomplete_batch(context_dir)
        if resume_ids_path is not None:
            batch_ids_path = resume_ids_path
            batch_ids = _load_ids(batch_ids_path)
            _log(f"Resuming incomplete batch {batch_ids_path.name} ({len(batch_ids)} ids)")
        else:
            batch_number = _next_batch_number(context_dir)
            prefix = f"current_regime_high_batch{batch_number:03d}"
            batch_ids_path = context_dir / f"{prefix}_ids.txt"
            batch_ids = high_ids[: args.batch_size]
            _write_batch_ids(batch_ids_path, batch_ids)
            _log(f"Created {batch_ids_path.name} with {len(batch_ids)} ids")

        prefix = _batch_prefix_from_ids_path(batch_ids_path)
        run_state.update({"current_batch_prefix": prefix, "last_error": "", "quota_wait_until": ""})
        _write_state(state_path, run_state)

        success = False
        attempt = 0
        while attempt < args.max_failures_per_batch:
            attempt += 1
            _log(f"Running {prefix} attempt {attempt}/{args.max_failures_per_batch}")
            rc, output = _run_enrichment(repo_root, input_csv, batch_ids_path, prefix, args.inner_batch_size)
            if rc == 0:
                success = True
                break
            quota_delay_s = _extract_quota_reset_delay_s(output)
            if quota_delay_s is not None:
                wait_s = max(quota_delay_s + 30.0, args.retry_delay_s)
                wait_until = datetime.now(timezone.utc) + timedelta(seconds=wait_s)
                run_state["status"] = "waiting_for_quota_reset"
                run_state["last_error"] = f"{prefix} hit Gemini quota; waiting until {wait_until.replace(microsecond=0).isoformat()}"
                run_state["quota_wait_until"] = wait_until.replace(microsecond=0).isoformat()
                _write_state(state_path, run_state)
                _log(run_state["last_error"])
                time.sleep(wait_s)
                run_state["status"] = "running"
                run_state["last_error"] = ""
                run_state["quota_wait_until"] = ""
                _write_state(state_path, run_state)
                attempt -= 1
                continue
            run_state["last_error"] = f"{prefix} failed with exit code {rc} on attempt {attempt}"
            _write_state(state_path, run_state)
            _log(run_state["last_error"])
            if attempt < args.max_failures_per_batch:
                time.sleep(args.retry_delay_s)

        if not success:
            run_state["status"] = "failed"
            _write_state(state_path, run_state)
            _log(f"Stopping after repeated failures on {prefix}")
            return 1

        last_merged = run_state.get("last_merged_batch", "")
        master_csv, _, browsed_count = _merge_browsed_outputs(context_dir, last_merged)
        _refresh_scaleout(repo_root, master_csv)
        high_ids = _load_ids(queue_path)

        run_state["processed_batches_this_run"] = int(run_state["processed_batches_this_run"]) + 1
        run_state["last_completed_batch_prefix"] = prefix
        run_state["last_merged_batch"] = prefix
        run_state["current_batch_prefix"] = ""
        run_state["direct_browsed_rows"] = browsed_count
        run_state["remaining_high_ids"] = len(high_ids)
        run_state["quota_wait_until"] = ""
        _write_state(state_path, run_state)
        _log(f"Completed {prefix}; direct browsed rows={browsed_count}; remaining high-priority ids={len(high_ids)}")

        if args.max_batches and int(run_state["processed_batches_this_run"]) >= args.max_batches:
            run_state["status"] = "stopped_max_batches"
            _write_state(state_path, run_state)
            _log("Reached max-batches limit; stopping.")
            return 0

        time.sleep(args.sleep_between_batches_s)

    run_state["status"] = "completed_high_queue"
    run_state["current_batch_prefix"] = ""
    run_state["remaining_high_ids"] = 0
    _write_state(state_path, run_state)
    _log("High-priority browse queue is empty.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
