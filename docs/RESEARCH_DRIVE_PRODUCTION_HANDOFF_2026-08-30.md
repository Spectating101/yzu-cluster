# Research Drive production handoff — 2026-08-30

This is the handoff for independent review of the deployed Research Drive
release. It deliberately pins identities and evidence rather than treating a
branch name as an authority.

## Live release

| Component | Repository | Release branch | Exact SHA |
| --- | --- | --- | --- |
| UI | `Spectating101/yzu-cluster` | `release/research-drive-production-20260830` | `5721877969266cf8634295db696ef10c8f5a870a` |
| API / data plane | `Spectating101/research-drive-private` | `release/research-drive-production-20260830` | `e94fb46a02ce687a03d0b0efbd3741acef18e586` |

The internal release endpoint is
`http://100.127.141.44:8765/research-drive-build.json`; it must report that
same pair. At handoff it does. `GET /healthz` returns `{ "status": "ok" }`.

Deployment scope is **Tailscale-internal, same-origin**. This is a real desk
deployment, not a public multi-tenant SaaS release.

## What was independently exercised

- Immutable UI build, release preflight, atomic promotion, restartability, and
  live identity verification.
- Candidate UI: `44` runtime-contract tests and `520` candidate-key tests.
- Real browser against the live desk: Home settled with no console errors;
  Discover `stablecoin` returned `Available 4` and `Library evidence 18`.
- A real, read-only Copilot Synthesis turn through the production virtualenv:
  Copilot account `huongly167`, model `GPT-5.3-Codex`, and evidence MCP tools
  returned a grounded construction with evidence roles and an unresolved
  question. It did not approve, collect, or mutate data.
- Cold Discover after promotion completed in 2.358s; the historical
  model/index cold-start false-zero state is not present.
- The optional web-context request now has a 15s client bound. A slow or failed
  external web lookup cannot leave Discover indefinitely in “Checking broader
  sources” while Library and acquisition results are already available.

## Current product loop

`Discover → assess held/reference evidence → inspect Library detail or create
an acquisition route → use Ask/Synthesis with grounded evidence → review before
writing or executing.`

Important truth boundaries are intentional:

- reference is not held evidence;
- verified is not query-ready;
- connected storage is not copied/indexed material;
- assistant output is not an approved construction;
- an unavailable external route is not a zero-result search.

## Remaining work: not release blockers

1. **Discover ranking:** Home’s “Pick up” ordering can favor a recent,
   non-query-ready reference ahead of query-ready evidence. The state is
   truthful, but query-ready usefulness should have a stronger rank signal.
2. **Discover semantic relevance:** the known quality gap for a query the
   corpus does not cover remains. The measured approach is subject-term /
   IDF-weighted overlap, not a generic similarity-score threshold. See
   `docs/findings/discover-relevance-measurements.md` before changing it.
3. **Provider governance:** Copilot works, but its credentials are pooled
   personal GitHub accounts. Keep the desk internal until a service-owned
   credential and provisioning policy exist.
4. **Operational backlog:** pending approvals, failed jobs, and stale or
   metadata-only records are operational state now shown honestly by the UI;
   they are not evidence of a broken deployment.

## Review instructions

1. Verify both remote branch heads and the live build manifest above.
2. Start from a clean browser session and test a concrete research question in
   Discover. Confirm it preserves Library results while any optional broader
   lookup is pending or unavailable.
3. Open a query-ready Library asset and a reference-only asset. Confirm their
   access/preview claims differ rather than being flattened into “data.”
4. Open Synthesis and perform only a read-only reasoning turn. Confirm the
   answer names evidence, limits, and unresolved choices before any approval.
5. Treat any security, principal-isolation, restartability, registry, or
   fabricated-truth defect as a release blocker. Treat isolated visual polish
   as follow-up unless it prevents the above workflow.

## Operational cautions

- Do not build in the serving clone: its `dist` is a release-linked runtime
  artifact. Use the staged release scripts.
- Do not move a serving checkout HEAD independently of its environment pin and
  build manifest.
- The backend checkout's runtime registry is intentionally a symlink and will
  appear as a type change in `git status`; it is runtime state, not a code diff.
- Locally generated `dist/` and `releases/` content is not source and is not
  committed.

For older investigation details and historical traps, read
`docs/RESEARCH_DRIVE_HANDOFF_2026-08-24.md` after this document, not before it.
