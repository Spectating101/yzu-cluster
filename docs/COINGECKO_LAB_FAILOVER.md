# CoinGecko Lab Failover

This setup is the practical replacement for the half-finished USB cluster idea.

## Goal

Keep the free-tier CoinGecko `daily` updater running even if a given machine is off.

## Recommended Stack

1. **Tailscale**
   Use this for private-network access, SSH, and remote troubleshooting.
   This is the machine-onboarding layer, not the data-sync layer.

2. **Syncthing**
   Use this for peer-to-peer replication between machines.
   This is the closest match to the "local torrent" idea.

3. **Scheduler**
   Run the same updater on every machine.
   Use `systemd --user` on Linux and Task Scheduler on Windows.

## How The Failover Runner Works

`scripts/run_coingecko_daily_failover.sh` is safe to install on every machine:

- it takes a local `flock` lock so only one copy runs per machine
- it checks whether `price_panel_clean.csv` already has today's row
- it sleeps a random delay before running
- it checks again after the delay
- if another machine already synced today's row, it exits cleanly
- otherwise it runs `scripts/coingecko_panel_update.py --mode daily --use-public-api`

This is intentionally simple. It is not a strict distributed lock across machines.
It relies on:

- staggered starts
- Syncthing syncing the updated panel files quickly
- the updater being idempotent enough to exit once today's row exists

That is usually good enough for one short daily job.

## Files To Keep Synced

At minimum, sync:

- `data_lake/crypto_pipeline/exports/`
- `data_lake/crypto_pipeline/failover_state/`

If you want the same code everywhere, sync the repo too.

## Files To Avoid Syncing

Avoid syncing noisy or machine-local paths such as:

- `logs/`
- `__pycache__/`
- `.git/`
- large one-off archives like `data_lake/coingecko_archive/`

## Install On A Lab Machine

### Linux

From the repo root:

```bash
chmod +x scripts/run_coingecko_daily_failover.sh \
  scripts/install_crypto_panel_failover_systemd_user.sh

bash scripts/install_crypto_panel_failover_systemd_user.sh
```

Check status:

```bash
systemctl --user status crypto-panel-failover.timer --no-pager
journalctl --user -u crypto-panel-failover.service -n 100 --no-pager
tail -n 100 logs/panel_update_failover.log
```

### Windows

From the repo root in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install_crypto_panel_failover_windows.ps1
```

The installer now also adds the controller SSH public key to:

```text
%USERPROFILE%\.ssh\authorized_keys
```

so remote non-interactive onboarding from the canonical machine works immediately.
Override the key if needed:

```powershell
.\scripts\install_crypto_panel_failover_windows.ps1 -ControllerPublicKey "ssh-ed25519 AAAA... your-key-comment"
```

Or double-click:

```text
scripts\install_crypto_panel_failover_windows.bat
```

That creates a daily Task Scheduler job which runs:

```text
scripts\run_coingecko_daily_failover.ps1
```

The Windows runner uses the same pattern as Linux:

- local single-machine lock
- random delay
- check whether today's row already exists
- run public CoinGecko daily update only if still needed

## Tuning

You can override the stagger window per machine:

```bash
COINGECKO_FAILOVER_RANDOM_DELAY_MAX_SEC=900 \
  scripts/run_coingecko_daily_failover.sh
```

You can also set a stable machine label:

```bash
COINGECKO_MACHINE_ID=lab-03 scripts/run_coingecko_daily_failover.sh
```

Windows equivalent:

```powershell
$env:COINGECKO_MACHINE_ID = "lab-03"
.\scripts\run_coingecko_daily_failover.ps1
```

### Optional Sync-Back To Canonical Host

If one machine should be the canonical dataset owner, set `COINGECKO_SYNC_BACK_DEST`
on backup nodes so successful updates are pushed back immediately.

Example (Linux backup node pushes three panel CSVs to canonical Linux host):

```bash
COINGECKO_SYNC_BACK_DEST="user@100.100.100.10:/home/user/Sharpe-Renaissance/data_lake/crypto_pipeline/exports/" \
  COINGECKO_SYNC_BACK_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" \
  scripts/run_coingecko_daily_failover.sh
```

Behavior:

- sync runs only after a successful local daily update
- retries are enabled by default (`COINGECKO_SYNC_BACK_RETRIES=3`)
- per-attempt timeout defaults to `300` seconds (`COINGECKO_SYNC_BACK_TIMEOUT_SEC`)
- retry delay defaults to `20` seconds (`COINGECKO_SYNC_BACK_RETRY_DELAY_SEC`)

### Canonical Pull-Sync (no new SSH trust needed)

If backup nodes cannot SSH back into your canonical machine, run a pull-sync on
the canonical machine instead:

```bash
scripts/sync_coingecko_panels_from_backup.sh
```

Defaults:

- source: `spectator@100.96.62.97:/home/spectator/Sharpe-Renaissance-coingecko-failover/data_lake/crypto_pipeline/exports/`
- destination: `data_lake/crypto_pipeline/exports/`
- files: `price_panel_clean.csv`, `mcap_panel_wide.csv`, `volume_panel_wide.csv`

Override source/destination if needed:

```bash
COINGECKO_BACKUP_SOURCE="user@host:/path/to/exports/" \
COINGECKO_CANONICAL_EXPORTS_DIR="/path/to/Sharpe-Renaissance/data_lake/crypto_pipeline/exports" \
  scripts/sync_coingecko_panels_from_backup.sh
```

### Cluster Coordinator Mode ("octopus brain")

Use one canonical machine to orchestrate a **node list** instead of relying only on
independent cron redundancy.

Script:

```bash
scripts/run_coingecko_network_coordinator.sh
```

Node config file (default):

```text
config/coingecko_cluster_nodes.conf
```

Each node line:

```text
name|ssh_host|repo_path|exports_path|runner_path_or_relative|os_type
```

Default flow:

1. check if canonical `price_panel_clean.csv` already has today's row
2. if missing, load the node list and probe nodes in round-robin order
3. dispatch the first healthy node to run its failover runner
4. pull the three panel CSVs from that node to canonical (rsync for Linux paths, scp for Windows `C:/...` paths)
5. verify today's row now exists locally
6. if not, continue to the next node until exhausted

Useful overrides:

```bash
COINGECKO_CLUSTER_NODES_FILE="/path/to/coingecko_cluster_nodes.conf" \
COINGECKO_REMOTE_RUN_TIMEOUT_SEC=1200 \
  scripts/run_coingecko_network_coordinator.sh
```

Force pull mode override if needed:

```bash
COINGECKO_SYNC_PULL_METHOD=scp scripts/sync_coingecko_panels_from_backup.sh
```

Recommended cron pattern on canonical:

- keep normal local daily updater
- run coordinator shortly after the update window (for example +20 minutes)
- optionally keep a later pull-only sync as a second safety net

## Caveat

If two machines start at almost the same time and Syncthing has not propagated the updated panel yet, both may run.
That is still much safer than the unfinished `Clusterfall` approach, because the updater itself exits once today's row is already present and the job is short-lived.

## Windows Caveat

The provided Windows installer registers the task for the current user with `Interactive`.
That is the least fragile option for a lab environment, but it means the task is tied to that user profile.
If you need truly unattended execution without a logged-in user, the next step would be a dedicated service account or a Windows service wrapper.
