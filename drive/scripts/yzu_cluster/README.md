# Production YZU runtime boundary

The deployed YZU orchestrator and worker implementation lives in the private repository:

```text
Spectating101/research-drive-private
drive/scripts/yzu_cluster/
```

Do not mirror production workers, host provisioning, archive integration, credentials, or controller entrypoints into this public path.

The public executable reference runtime is intentionally located at repository root:

```text
scripts/yzu_cluster/
tests/test_yzu_interop_*.py
```

That package defines and tests the shared behavioral contract without claiming to be the deployed Optiplex/Windows/GDrive control plane.

`scripts/yzu_cluster/interop_ingest.py` is a later-main labelled test ingest (`test_ingest_src_20260919`). It is not RC2, not a GitHub Release, and not Query-ready promotion of the RC2 golden asset.
