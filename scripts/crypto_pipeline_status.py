#!/usr/bin/env python3
"""Quick status check for crypto pipeline"""
import json
from pathlib import Path
from datetime import datetime, timezone

REPO = Path(__file__).resolve().parents[1]
CONTEXT = REPO / "data_lake" / "crypto_pipeline" / "context"

# Read state
state_path = CONTEXT / "current_regime_auto_runner_state.json"
if state_path.exists():
    state = json.loads(state_path.read_text())
else:
    state = {}

# Count completed
master_csv = CONTEXT / "current_regime_browsed_master_summary.csv"
if master_csv.exists():
    with open(master_csv) as f:
        total_rows = sum(1 for _ in f) - 1  # exclude header
else:
    total_rows = 0

# Current batch progress
current_batch = state.get("current_batch_prefix", "")
if current_batch:
    batch_csv = CONTEXT / f"{current_batch}_summary.csv"
    if batch_csv.exists():
        with open(batch_csv) as f:
            batch_rows = sum(1 for _ in f) - 1
        ids_file = CONTEXT / f"{current_batch}_ids.txt"
        batch_total = len(ids_file.read_text().strip().split('\n'))
        batch_progress = f"{batch_rows}/{batch_total}"
    else:
        batch_progress = "starting..."
else:
    batch_progress = "idle"

remaining = state.get("remaining_high_ids", 0)
now = datetime.now(timezone.utc)

print(f"🔄 Pipeline Status @ {now.strftime('%H:%M:%S UTC')}")
print(f"   Total completed: {total_rows} coins")
print(f"   Current batch: {current_batch or 'none'} ({batch_progress})")
print(f"   Remaining: {remaining} IDs")
print(f"   Status: {state.get('status', 'unknown')}")
if state.get("quota_wait_until"):
    print(f"   Quota wait until: {state['quota_wait_until']}")
if state.get("last_error"):
    print(f"   Last error: {state['last_error']}")
