# YZU Cluster — Research Drive

Public GitHub home for the **YZU Research Drive** product: researcher-facing UI, design canon, visual-review evidence, interoperability contracts, and a dependency-free executable reference runtime.

## Currency (2026-09-18)

The **public candidate** is the existing GitHub release [`research-drive-rc2`](https://github.com/Spectating101/yzu-cluster/releases/tag/research-drive-rc2), commit `33fcacb4416e1a8ae53d0e16bbd14b19d8ebf3c9`. This packaging does not create a new tag or release.

| Ref | SHA | Status |
|---|---|---|
| Named release `research-drive-rc2` (peeled commit) | `33fcacb4416e1a8ae53d0e16bbd14b19d8ebf3c9` | Public candidate. GitHub Latest. |
| Annotated tag object | `279a59f5f82a8e7a3aec749cbddcc540cf0e6e7e` | Tag object SHA. Different from the peeled commit. |
| Frozen public product pin | `b40ff0945f5e1957f0100742185e2a78b06dd498` | Interface SHA inside RC2. Different from both tag SHAs. |
| Frozen runtime pin | `07cb7b885454aef32f3e2351da8733794fe9c17b` | Companion SHA in `Spectating101/research-drive-private`. |
| GitHub `main` | `8a1e62de1d0b38de9dc3f9908458371f9e3ba27e` | Default clone / Pages source as of 2026-08-25. Later than RC2. **Not** a new release. |
| `research-drive-public-20260917.2` | `c577b1cb7f8bad23b8a8b4a2b09bf7d6973225ea` | Later snapshot tag. Different SHA. **Not** RC2. Not a GitHub Release. |
| `ops/rc3-auto-preview` | `62284a59a00dd16defba6aa6c6054eec4a24097d` | RC3-preview ops. **Not** RC2. |

Earlier snapshot tags `research-drive-public-20260913`, `research-drive-public-20260917`, and `research-drive-public-20260917.1` are also different SHAs from RC2. Inspection claims: [`docs/CLAIMS_BOUNDARY.md`](docs/CLAIMS_BOUNDARY.md), [`docs/product/claims-and-nonclaims.v1.json`](docs/product/claims-and-nonclaims.v1.json).

This repository is **not the deployed lab control plane**. Companion API, MCP, orchestrator, workers, scrapers, registry writes, host configuration, and `data_lake/` live in `Spectating101/research-drive-private`. That repository is **GitHub-public as of 2026-09-18** despite the name. Its default README currently describes Sharpe-Renaissance, not Research Drive.

Public and companion are not fake versus real:

- **This public repo** publishes the interface and executable behavioral contract.
- **The companion repo** holds the named RC2 runtime pin; that is not institutional adoption and not production beyond that SHA pair.
- RC2 recorded live-acceptance evidence in its own release notes. Connected cloud mounts, including GDrive, are not owned product bytes.

Read [`docs/REPOSITORY_TOPOLOGY.md`](docs/REPOSITORY_TOPOLOGY.md) before changing repository boundaries or starting a new release branch. Topology dates in that file are older than this currency note.

## What this is

| Promise | What professors get |
|---------|---------------------|
| **Organized lab data** | Library catalog mapped to vault partitions |
| **Procurement assistant** | Composer + MCP — search, query, collect, register |
| **Research-asset construction** | Synthesis turns research intent into validated, reusable assets |

**Not** alpha trading and not SolarPunk — those are separate products.

## Public authorities

| Path | Role |
|---|---|
| `drive/src/v2/` | Research Drive interface |
| `e2e/` | Browser and rendered-state contracts |
| `docs/product/` | Public product and interoperability contracts |
| `scripts/yzu_cluster/` | Executable dependency-free reference runtime |
| `scripts/yzu_cluster/interop_ingest.py` | Later-main labelled test ingest journey (not RC2) |
| `tests/test_yzu_interop_*.py` | Reference runtime behavioral tests |

The public reference runtime is intentionally framework-neutral. It does not contain the private host, archive, credential, or production-data environment.

## Live surfaces

| Surface | URL |
|---------|-----|
| **GitHub Pages** — static UI + demo seed | https://spectating101.github.io/yzu-cluster/ (follows GitHub `main`, not the RC2 tag) |
| **Full desk** — companion API + chat + workers | Run from a `research-drive-private` checkout pinned to the named runtime SHA |

Static Pages shows the v2 shell and offline/demo data. Composer chat and live registry require the companion API. Pages is not the RC2 live-accepted desk.

## RC2 accepted release

Research Drive RC2 is live-accepted with the implementation pins below:

| Surface | Accepted SHA |
|---|---|
| Public product | `b40ff0945f5e1957f0100742185e2a78b06dd498` |
| Private runtime | `07cb7b885454aef32f3e2351da8733794fe9c17b` |

The release truth anchor is `procured_src_b0a7ba3817a5`: it is **Registered**, queryable through the accepted runtime authority, and deliberately **not** represented as Query ready.

A later-main synthetic test ingest (`test_ingest_src_20260919` in `scripts/yzu_cluster/fixtures/test_ingest_journey_20260919/`) exercises byte-preserving ingest, synthesis, restart, worker failure, and retry on this public reference runtime. That journey is **not** RC2, **not** a GitHub Release, **not** a live acquisition, and it does **not** promote the RC2 golden asset to Query ready.

- [RC2 release notes](docs/releases/RESEARCH_DRIVE_RC2.md)
- [RC2 operator quickstart](docs/releases/RC2_OPERATOR_QUICKSTART.md)
- [Machine-readable RC2 manifest](release/research-drive-rc2.json)

Run the independent clean-checkout release gate locally:

```bash
npm ci
npx playwright install chromium --with-deps
npm run release:verify
npm run release:test
npm run release:package
```

## Run locally

### Frontend and public fixtures

```bash
npm install
npm run dev
# proxy → :8765 when a private API is available
```

### Full desk

From a `research-drive-private` checkout pinned to the named runtime SHA (the default README there is still Sharpe-Renaissance; do not treat that as Research Drive product copy):

```bash
bash drive/scripts/run_yzu_cluster.sh
# UI → http://127.0.0.1:5178
# API → http://127.0.0.1:8765
```

Do not infer that a Python facade in this public history is the deployed backend. A public module that imports absent private packages is transitional and not a runnable authority.

## Validation

```bash
npm run build
npm run test:runtime-contract
python -m unittest discover -s tests -p "test_yzu_interop_*.py" -v
npm run release:verify
npm run release:test
```

Rendered review uses the Playwright suites under `e2e/` and, when the companion desk is available, the live integration capture scripts.

`npm run release:package` creates a deterministic public static distribution, file inventory, and SHA-256 checksums under `artifacts/`. It never packages the companion control plane, secrets, registry data, or collected datasets.

## Canon docs

- [`docs/CLAIMS_BOUNDARY.md`](docs/CLAIMS_BOUNDARY.md) — inspection claims and nonclaims
- [`docs/product/claims-and-nonclaims.v1.json`](docs/product/claims-and-nonclaims.v1.json) — machine-readable bound SHA/tag
- [`docs/REPOSITORY_TOPOLOGY.md`](docs/REPOSITORY_TOPOLOGY.md) — repository and release authority (older than the currency note above)
- [`docs/UI_PRODUCT_AUTHORITY.md`](docs/UI_PRODUCT_AUTHORITY.md) — interface authority
- [`docs/RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md`](docs/RESEARCH_DRIVE_RIGHT_RAIL_CONTRACT.md) — Detail | Ask rail
- [`docs/product/SYNTHESIS_S04_PRODUCT_SPEC.md`](docs/product/SYNTHESIS_S04_PRODUCT_SPEC.md) — Synthesis product model
- [`docs/product/CLUSTER_RUNTIME_INTEROP_CONTRACT.md`](docs/product/CLUSTER_RUNTIME_INTEROP_CONTRACT.md) — public/companion runtime contract

## Publishing discipline

The public repository may receive UI, public docs, fixtures, screenshots, E2E coverage, and reference-contract code. It must not receive credentials, host inventory, databases, local datasets, GDrive configuration, or the production control plane.

Historical and superseded PR branches remain available for archaeology, but only one cumulative public release PR should remain active.

## Share line

> Research Drive is a research data desk: organized vault catalog, registered-asset query against a named runtime, and a Composer-backed procurement loop. RC2 is the named public candidate. This is not a Yuan Ze University deployment claim.
