# Research Drive (procurement)

Acquire, catalog, vault, and serve datasets for the professor desk.

## Owns

- `drive/scripts/yzu_cluster/` — job queue, Windows fleet, worker
- `drive/scripts/research_data_mcp/` — MCP tools, Composer chat, flywheel
- `drive/scripts/research_query_engine/` — HTTP API `:8765`
- `drive/src/v2/` — Research Drive React UI (Vite `:5178`)
- `drive/config/` — registry (write), collection queue, GDrive partitions, GDELT fleet

## Entry points

```bash
bash drive/scripts/run_yzu_cluster.sh          # API + UI + worker
bash drive/scripts/run_research_query_engine.sh
bash drive/scripts/run_research_data_mcp.sh
bash drive/scripts/run_data_collection_queue.py
bash drive/scripts/run_news_shock_gkg_expanded_fleet.sh status
```

Legacy paths under `scripts/` are symlinks into this tree.

## Contract with Alpha

- **Writes** `drive/config/research_query_registry.json` (symlinked at `config/`)
- **Writes** `data_lake/collection/` and bulk panels on Transcend
- Alpha **reads** registry only via `kernel/sharpe_kernel/platform_bridge.py`

See `../REPO_LAYOUT.md`.
