# Research Drive RC2 operator quickstart

This guide is for someone who needs to run, inspect, or package the accepted RC2 without reconstructing its history.

## Choose the surface

### Public interface and fixtures

Use the public repository when you need the interface, browser tests, screenshots, product contracts, or the static distribution.

```bash
git checkout b40ff0945f5e1957f0100742185e2a78b06dd498
npm ci
npm run dev
```

The public checkout can show the complete interface with demo fixtures. It is not the production API or data authority.

### Full Research Drive desk

Use the private Research Drive checkout when you need Composer, the live registry, procurement, archive verification, workers, or real datasets.

The accepted private runtime pin is:

```text
07cb7b885454aef32f3e2351da8733794fe9c17b
```

Follow the private host runbook and environment example. Keep access tokens and API keys host-local; never paste them into issue comments, chat transcripts, screenshots, shell history, or the public repository.

## Public clean-checkout verification

```bash
npm ci
npx playwright install chromium --with-deps
npm run release:verify
npm run release:test
```

The command sequence validates:

- RC2 manifest schema and exact accepted pins;
- public/private repository boundary;
- candidate identity and lifecycle contracts;
- dependency-free reference runtime interoperability;
- complete read-only professor browser journey;
- desktop and mobile containment;
- absence of material job submissions.

## Build the static release package

```bash
npm run release:package
```

Outputs:

```text
artifacts/research-drive-rc2-public.tar.gz
artifacts/research-drive-rc2-public.tar.gz.sha256
artifacts/rc2-release/research-drive-rc2/
```

The staged directory contains:

- production `dist/` frontend;
- accepted release manifest;
- release notes;
- this operator quickstart;
- repository README;
- file inventory and SHA-256 checksums.

Verify the package:

```bash
sha256sum -c artifacts/research-drive-rc2-public.tar.gz.sha256
tar -tzf artifacts/research-drive-rc2-public.tar.gz
```

## Read-only live smoke

Against an already deployed private desk, use the existing live verifier:

```bash
YZU_API_URL=http://127.0.0.1:8765 \
YZU_DESK_URL=http://127.0.0.1:8765 \
npm run desk:integration
```

For RC2 closure, live verification must remain read-only:

- health and Composer identity;
- catalog availability;
- golden dataset description;
- golden query with a small limit;
- empty queue counters;
- no readiness promotion;
- no worker-control exposure.

Do not create an acquisition, synthesis, or fixture job merely to prove that the release exists.

## Failure interpretation

| Failure | Meaning |
|---|---|
| Manifest or ancestry failure | The checkout is not descended from the accepted public implementation or release metadata changed incorrectly. |
| Boundary failure | Packaging introduced a production/private artifact into the public repository. |
| Browser journey failure | A professor-facing workflow or accessibility contract regressed. |
| Runtime contract failure | Public and private behavioral expectations no longer agree. |
| Package checksum failure | The distribution is incomplete or was modified after packaging. |
| Live golden-asset failure | Runtime authority, local bytes, or registry identity regressed; do not fabricate Query ready. |

## Stop condition

After the exact tag, package checksum, and release notes exist, RC2 is complete. New capabilities belong to a later release branch.
