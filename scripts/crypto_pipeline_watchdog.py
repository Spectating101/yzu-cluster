#!/usr/bin/env python3
"""
Crypto Pipeline Watchdog
Monitors the runner and auto-restarts if hung for >15 minutes with no progress.
"""

import time
import subprocess
import signal
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTEXT_DIR = REPO_ROOT / "data_lake" / "crypto_pipeline" / "context"
PID_FILE = CONTEXT_DIR / "current_regime_auto_runner.pid"
LOG_FILE = CONTEXT_DIR / "current_regime_auto_runner.log"
RUNNER_SCRIPT = REPO_ROOT / "scripts" / "crypto_current_regime_batch_runner.py"

CHECK_INTERVAL = 180  # 3 minutes
HANG_TIMEOUT = 900  # 15 minutes


def get_runner_pid():
    if not PID_FILE.exists():
        return None
    try:
        return int(PID_FILE.read_text().strip())
    except:
        return None


def is_process_alive(pid):
    try:
        subprocess.run(["ps", "-p", str(pid)], check=True, capture_output=True)
        return True
    except:
        return False


def get_log_age():
    if not LOG_FILE.exists():
        return float('inf')
    mtime = LOG_FILE.stat().st_mtime
    return time.time() - mtime


def kill_runner(pid):
    print(f"[{datetime.now(timezone.utc).isoformat()}] Killing hung runner PID {pid}")
    try:
        subprocess.run(["kill", str(pid)], check=False)
        time.sleep(3)
        if is_process_alive(pid):
            subprocess.run(["kill", "-9", str(pid)], check=False)
    except:
        pass


def start_runner():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting new runner")
    proc = subprocess.Popen(
        ["python3", str(RUNNER_SCRIPT)],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True
    )
    PID_FILE.write_text(str(proc.pid))
    return proc.pid


def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Watchdog started")
    
    while True:
        time.sleep(CHECK_INTERVAL)
        
        pid = get_runner_pid()
        if not pid or not is_process_alive(pid):
            print(f"[{datetime.now(timezone.utc).isoformat()}] Runner not running, starting...")
            start_runner()
            continue
        
        log_age = get_log_age()
        if log_age > HANG_TIMEOUT:
            print(f"[{datetime.now(timezone.utc).isoformat()}] Runner hung (log age: {log_age:.0f}s)")
            kill_runner(pid)
            time.sleep(5)
            start_runner()
        else:
            # All good
            pass


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Watchdog stopped")
