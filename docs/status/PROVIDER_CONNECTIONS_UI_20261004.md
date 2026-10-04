# Data provider connections UI

Branch: `codex/provider-connections-ui-20261004`, built on UI audit `816b17a4`.
Pair with backend branch `codex/provider-connections-20261004`; detailed setup and
account acceptance instructions are in its
`docs/ops/PROVIDER_CONNECTIONS_IMPLEMENTATION_20261004.md`.

Settings adds provider setup, registration review/checkpoints, managed-browser
resume, encrypted credential submission, bounded access verification, collection
approval submission and revocation. Guest/public accounts do not load private
provider metadata. Secrets stay in React memory only and credential fields clear
after saving or switching connections.

Checks: 573 UI unit tests plus 3 pretests, 21 Playwright tests (all pages mount,
account flow and authority boundaries included), and production build passed.
Existing cloud-storage account tests also pass.

1440×900 and 390×844 screenshots were read. The provider form uses existing Settings
styles with readable 12px hints; fields stack on mobile and buttons wrap without
horizontal overflow. Frontend pipeline `codex-provider-connections-20261004` passed
its gate and closed.

Evidence: `~/.config/yzu-host-acceptance/evidence/provider_connections_codex_20261004/`.
No public deployment or edits to Claude's checkout were made.
