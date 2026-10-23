# Research Drive RC2

**Status:** live accepted  
**Accepted:** 2026-07-21  
**Release manifest:** [`release/research-drive-rc2.json`](../../release/research-drive-rc2.json)

## Frozen product pins

| Surface | Accepted SHA |
|---|---|
| Public product | `b40ff0945f5e1957f0100742185e2a78b06dd498` |
| Private runtime | `07cb7b885454aef32f3e2351da8733794fe9c17b` |

The release-packaging commit may be newer than the accepted public product SHA. That is intentional: packaging, verification, and release documentation may advance while the accepted interface/runtime implementation remains frozen at the pins above.

## What RC2 delivers

Research Drive RC2 is a professor-facing research data desk with one coherent flow:

1. resume a research context from Home;
2. inspect organized lab holdings in Library;
3. discover and evaluate missing external data;
4. ask grounded questions against the selected context;
5. construct defensible research assets in Synthesis;
6. inspect operational evidence in Resources;
7. verify assistant, archive, and access state in Settings.

The interface is responsive across desktop and mobile, preserves context through the Detail | Ask rail, explains lifecycle states through accessible popovers, shows layout-preserving loading states, and exposes staged progress for Ask and approval actions.

## Live acceptance evidence

The accepted deployment proved all of the following together:

- Composer health is truthful: the configured interpreter imports `cursor_sdk` and read-only Ask succeeds;
- `GET /library/catalog` returns successfully;
- the golden registered asset is describable and queryable without `receipt_only` drift;
- the golden asset remains **Registered**, with `analysis_readiness=metadata_search`, and is not falsely promoted to Query ready;
- registry and procured bytes resolve through the runtime authority;
- queued, running, and pending job counts remain zero after read-only acceptance;
- rich readiness popovers work through pointer, keyboard, Escape, outside click, and mobile tap;
- Home skeletons preserve geometry and avoid horizontal overflow;
- Ask retains the user message, shows four-stage progress, returns the final answer, and creates no job;
- reduced-motion mode suppresses animation;
- worker control remains isolated from the public front door.

## Golden release asset

| Field | Value |
|---|---|
| Dataset | `procured_src_b0a7ba3817a5` |
| Job | `01bf070a7e86` |
| Manifest | `collection_manifest_01bf070a7e86` |
| Run | `run-eb54da87916b43728d4ca474c72a159a` |
| Readiness | `registered` |
| Analysis readiness | `metadata_search` |
| Query smoke | `manifest.json`, `rfc9110.txt` |

This asset is the release truth anchor. Verification must not manufacture `query_ready` or create a replacement acquisition merely to make a smoke test pass.

## Verification

From a clean public checkout:

```bash
npm ci
npx playwright install chromium --with-deps
npm run release:verify
npm run release:test
npm run release:package
```

`release:test` is read-only. It validates the manifest and repository boundary, runs public identity/runtime contracts, exercises the complete professor journey in a mocked browser environment, and asserts that no material job endpoint is invoked.

`release:package` produces a static public distribution under `artifacts/` with a deterministic archive and SHA-256 checksums. The package does not contain the private API, secrets, host configuration, registry data, or collected datasets.

## Known truthful limitations

- RC2 is not a public multi-user SaaS deployment.
- The public repository is the interface and behavioral contract, not the production control plane.
- Registered does not imply Query ready.
- Automatic Query-ready promotion is deferred.
- The temporary external tunnel is not a release authority or stable product URL.
- Material acquisition and Synthesis execution remain explicit, separately accepted operations.

## Closure rule

RC2 is closed after the release tag and package are published. Any feature beyond the manifest belongs to a later release and must not reopen RC2.
