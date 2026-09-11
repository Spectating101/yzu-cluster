import { useState } from "react";
import { saveDeskToken } from "@/v2/deskSession";

/**
 * First paint while the browser establishes its same-origin session.
 *
 * This is deliberately not the locked gate: a public guest starts in this
 * state for a short time before its restricted session exists. Showing the
 * private-desk token wall during that normal bootstrap made the public launch
 * look broken even though the next request correctly opened Library/Discover.
 */
export function DeskSessionBootstrap() {
  return (
    <div
      className="yzu-shell with-inspector rd-theme-light rd-v2-shell rd-v2-session-bootstrap"
      aria-busy="true"
      data-testid="desk-session-bootstrap"
    >
      <span className="rd-v2-visually-hidden">Opening Research Drive</span>
      <header className="rd-v2-header rd-v2-bootstrap-header" aria-hidden="true">
        <span className="rd-brand-mark">RD</span>
        <strong>Research Drive</strong>
        <span className="rd-v2-bootstrap-line short" />
      </header>
      <aside className="yzu-sidebar rd-v2-bootstrap-sidebar" aria-hidden="true">
        {['Home', 'Library', 'Discover', 'Synthesis', 'Resources'].map((label, index) => (
          <span key={label} className={index === 0 ? "active" : ""}>{label}</span>
        ))}
      </aside>
      <main className="yzu-main rd-v2-shell-main rd-v2-bootstrap-main" aria-hidden="true">
        <div className="rd-v2-bootstrap-title"><span /><i /></div>
        <section className="rd-v2-bootstrap-canvas">
          <span className="rd-v2-bootstrap-line eyebrow" />
          <span className="rd-v2-bootstrap-line title" />
          <span className="rd-v2-bootstrap-line copy" />
          <span className="rd-v2-bootstrap-line copy short" />
        </section>
      </main>
      <aside className="yzu-inspector rd-v2-bootstrap-rail" aria-hidden="true">
        <span className="rd-v2-bootstrap-line eyebrow" />
        <span className="rd-v2-bootstrap-line title" />
        <span className="rd-v2-bootstrap-line copy" />
      </aside>
    </div>
  );
}

/** Private-by-default entry for browsers outside the trusted Tailscale desk. */
export function DeskAccessGate({ access, busy = false, onRetry }) {
  const [token, setToken] = useState("");
  const configured = access?.server_configured;
  const bootstrapError = String(access?.bootstrap?.error || "");
  const currentEntryIsUntrusted = /not permitted|forbidden|\b403\b/i.test(bootstrapError);
  const canTryAutomaticEntry = Boolean(access?.session?.bootstrap_available) && !currentEntryIsUntrusted;

  const connect = () => {
    const value = saveDeskToken(token);
    setToken("");
    onRetry?.({ force: true, tokenProvided: Boolean(value) });
  };

  return (
    <main className="rd-v2-access-gate" aria-labelledby="rd-access-title" data-testid="desk-access-gate">
      <section className="rd-v2-access-card">
        <span className="rd-v2-access-kicker">RESEARCH DRIVE · PRIVATE DESK</span>
        <h1 id="rd-access-title">Research data stays inside the desk.</h1>
        <p>
          This browser has not established an authorized desk session. Catalog data, faculty memory,
          credentials, jobs, and worker details remain hidden until access is verified.
        </p>

        <div className="rd-v2-access-boundary" aria-label="Access boundary">
          <span><i aria-hidden="true">✓</i> Interface shell</span>
          <span><i aria-hidden="true">—</i> Research data</span>
          <span><i aria-hidden="true">—</i> Ask and collection</span>
          <span><i aria-hidden="true">—</i> Operations</span>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            connect();
          }}
        >
          <label htmlFor="rd-access-token">Desk access token</label>
          <div className="rd-v2-access-form-row">
            <input
              id="rd-access-token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste your desk access token"
            />
            <button type="submit" disabled={busy || !token.trim()}>
              {busy ? "Checking…" : "Connect"}
            </button>
          </div>
        </form>

        <button
          type="button"
          className="rd-v2-access-retry"
          disabled={busy}
          onClick={() => onRetry?.({ force: true, tokenProvided: false })}
        >
          {canTryAutomaticEntry ? "Retry trusted internal entry" : "Check access again"}
        </button>

        <small>
          {configured === false
            ? "This host has no desk credential configured; protected APIs fail closed."
            : currentEntryIsUntrusted
              ? "This browser is not on a trusted desk entry. Use your issued access token, or open the desk through its approved address."
            : access?.error
              ? "Secure access check is unavailable. The desk remains locked; retry after the service is restored."
              : "Use the token issued for your member or operator account."}
        </small>
      </section>
    </main>
  );
}
