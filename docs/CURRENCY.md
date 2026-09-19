# Research Drive — release currency

Exact refs, tags and pins behind the public candidate. Moved out of the README so the front page
describes the product; this file is the authority for which SHA is which.

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

This repository is **not the deployed lab control plane**. Companion API, MCP, orchestrator, workers, scrapers, registry writes, host configuration, and `data_lake/` live in `Spectating101/research-drive-private`. That repository is private (made private again on 2026-09-20).

Public and companion are not fake versus real:

- **This public repo** publishes the interface and executable behavioral contract.
- **The companion repo** holds the named RC2 runtime pin; that is not institutional adoption and not production beyond that SHA pair.
- RC2 recorded live-acceptance evidence in its own release notes. Connected cloud mounts, including GDrive, are not owned product bytes.

Read [`docs/REPOSITORY_TOPOLOGY.md`](docs/REPOSITORY_TOPOLOGY.md) before changing repository boundaries or starting a new release branch. Topology dates in that file are older than this currency note.
