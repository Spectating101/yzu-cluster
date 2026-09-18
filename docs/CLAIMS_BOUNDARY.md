# Claims boundary — Research Drive

Machine-readable twin: [`product/claims-and-nonclaims.v1.json`](product/claims-and-nonclaims.v1.json).

This file binds the **existing** GitHub release `research-drive-rc2`. It does not create a tag, reopen RC2, or promote later snapshot work.

## Authority

| Field | Value |
|---|---|
| Named release | [`research-drive-rc2`](https://github.com/Spectating101/yzu-cluster/releases/tag/research-drive-rc2) |
| Annotated tag object | `279a59f5f82a8e7a3aec749cbddcc540cf0e6e7e` |
| Peeled tag commit | `33fcacb4416e1a8ae53d0e16bbd14b19d8ebf3c9` |
| Frozen public product pin | `b40ff0945f5e1957f0100742185e2a78b06dd498` |
| Frozen runtime pin | `07cb7b885454aef32f3e2351da8733794fe9c17b` on `Spectating101/research-drive-private` |
| Default clone (`origin/main`) | `8a1e62de1d0b38de9dc3f9908458371f9e3ba27e` (2026-08-25) — later than RC2, **not** a new release |
| Later public snapshots | `research-drive-public-20260913`, `research-drive-public-20260917`, `.1`, `.2` — **different SHAs**, not RC2, not GitHub Releases |
| RC3-preview | `ops/rc3-auto-preview` @ `62284a59a00dd16defba6aa6c6054eec4a24097d` is **not** RC2 |

The annotated tag object, peeled commit, and frozen public product pin are three different SHAs. Do not collapse them. The packaging commit may be newer than the frozen public product pin. That is already stated in the RC2 notes. It is not a second release.

## Supported now

- The public candidate for inspection is the named RC2 release at `33fcacb`.
- RC2 freezes the public/runtime SHA pair above.
- This public repo is the interface and behavioral contract, not the production control plane.
- The RC2 golden asset `procured_src_b0a7ba3817a5` is Registered and is not Query ready.
- `origin/main` and the later `research-drive-public-20260917*` tags exist and are not RC2.
- `research-drive-private` is GitHub-public as of 2026-09-18 despite the name.
- On this packaging checkout, `npm run test:candidate-key` (247), `npm run test:runtime-contract` (40), and the Python interop suite (32) passed. Default `npm run release:verify` fails because `main` already changed product files after the frozen public pin; `node scripts/verify_rc2_release.mjs --closed-release` passed.

## Do not claim

- Yuan Ze University or any other institution adopted or deployed this.
- Production exists beyond the named SHA pair.
- Ownership of Google Drive or other connected cloud bytes.
- That `research-drive-private` is private.
- That `origin/main`, `live/deployed-ui-20260825`, `research-drive-public-20260917*`, or RC3-preview `62284a5` is RC2 or a new named release.
- That GitHub Pages is the RC2 live desk.
- Public multi-user SaaS, Query-ready promotion, or that green CI reopens RC2.

## What would promote the claim

1. **New named release** — publish a GitHub Release for a later SHA and rebind this file. Do not retag RC2.
2. **Production beyond the pair** — name both SHAs and show independent host evidence that is not a connected third-party drive.
3. **Institutional adoption** — named institution, scope, durable receipt, unaltered artifact.
4. **Cloud-byte ownership** — account or legal evidence of owned storage. A GDrive mount is not that.
5. **Query ready** — RC2-style acceptance of the named golden asset as `query_ready`, without manufacturing a replacement acquisition.
