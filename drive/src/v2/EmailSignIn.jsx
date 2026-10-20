import { useEffect, useId, useState } from "react";
import { fetchJson } from "./apiCore.js";
import { connectorReturnPath } from "./connectorReturn.js";
import { clearDeskToken, markDeskSessionBootstrapped, notifyDeskIdentityChange } from "./deskSession.js";
import "./accounts.css";

export function readEmailLinkFragment() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#desk-email=")) return null;
  const token = window.location.hash.slice("#desk-email=".length);
  // Remove it before the app performs telemetry, data requests or routing.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export function EmailLinkConfirmation({ token, onCancel, onRequestNew }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  useEffect(() => {
    let current = true;
    fetchJson("/library/desk/email/inspect", { method: "POST", body: JSON.stringify({ token }), timeoutMs: 15000 })
      .then((out) => { if (current) setTarget(out); })
      .catch((reason) => { if (current) setError(reason.message); });
    return () => { current = false; };
  }, [token]);
  const complete = async () => {
    setBusy(true); setError(""); clearDeskToken();
    try {
      await fetchJson("/library/desk/email/consume", { method: "POST", body: JSON.stringify({ token }), timeoutMs: 15000 });
      markDeskSessionBootstrapped(true);
      notifyDeskIdentityChange();
      window.location.replace(connectorReturnPath({ consume: true }) || "/?tab=home");
    } catch (reason) { setTarget(null); setError(reason.message); setBusy(false); }
  };
  const lockup = <div className="rd-v2-access-lockup" aria-hidden="true"><span className="rd-v2-access-mark">RD</span><span><strong>Research Drive</strong><small>Research data you can use, with where it came from</small></span></div>;
  if (error && !target) {
    return <main className="rd-v2-access-gate rd-email-link-gate"><section className="rd-v2-access-card" aria-labelledby="rd-email-confirm-title" data-testid="email-link-invalid">
      {lockup}
      <h1 id="rd-email-confirm-title">This link can’t be used</h1>
      <p role="alert">Sign-in links work once and expire after 15 minutes. Request a new one and open the latest email.</p>
      <div className="rd-access-actions">
        <button type="button" className="rd-v2-btn primary" onClick={onRequestNew || onCancel}>Request a new link</button>
        <button type="button" className="rd-v2-btn ghost" onClick={onCancel}>Back to Research Drive</button>
      </div>
    </section></main>;
  }
  return <main className="rd-v2-access-gate rd-email-link-gate"><section className="rd-v2-access-card" aria-labelledby="rd-email-confirm-title">
    {lockup}
    <h1 id="rd-email-confirm-title">{target ? "Continue to Research Drive" : "Checking your link…"}</h1>
    {target ? <p>Signing in as <strong>{target.email}</strong>. If this browser is signed in to another account, that session ends.</p> : <p role="status">This takes a moment.</p>}
    <div className="rd-access-actions">
      <button type="button" className="rd-v2-btn primary" disabled={busy || !target} onClick={complete}>{busy ? "Signing in…" : "Continue"}</button>
      <button type="button" className="rd-v2-btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
    {error ? <p role="alert" className="rd-access-error">{error}</p> : null}
  </section></main>;
}

export function EmailSignInForm({ signupAvailable = false }) {
  const id = useId();
  const [purpose, setPurpose] = useState("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try {
      const out = await fetchJson("/library/desk/email/request", { method: "POST", timeoutMs: 15000,
        body: JSON.stringify({ email, purpose, ...(purpose === "invite" ? { invitation } : {}), ...(purpose === "signup" ? { display_name: name } : {}) }) });
      setInvitation(""); setNotice(out.message);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  return <form className="rd-email-signin" onSubmit={submit} aria-label="Email account access">
    <label htmlFor={`${id}-purpose`}>Account option</label>
    <select id={`${id}-purpose`} className="rd-v2-select" value={purpose} disabled={busy} onChange={(event) => { setPurpose(event.target.value); setNotice(""); setError(""); setInvitation(""); }}>
      <option value="signin">Sign in</option>
      {signupAvailable ? <option value="signup">Create account</option> : null}
      <option value="invite">Accept invitation / verify existing account</option>
      <option value="recover">Recover access and end earlier sessions</option>
    </select>
    <label htmlFor={`${id}-email`}>Account email</label>
    <input id={`${id}-email`} className="rd-v2-input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
    {purpose === "signup" ? <><label htmlFor={`${id}-name`}>Your name</label><input id={`${id}-name`} className="rd-v2-input" autoComplete="name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /><p>Creating an account gives you Ask and personal saved work. Lab access to collection and providers is granted separately.</p></> : null}
    {purpose === "invite" ? <><label htmlFor={`${id}-invitation`}>Invitation or existing access code</label><input id={`${id}-invitation`} type="password" className="rd-v2-input" autoComplete="one-time-code" required value={invitation} onChange={(event) => setInvitation(event.target.value)} /><p>Use the email named on your invitation. Verification keeps your existing account and saved work, and retires this code.</p></> : null}
    {purpose === "signup" ? <p>Your research trail is visible to you and desk operators. Other researchers can browse the shared Library.</p> : null}
    <p>We’ll email a link that expires in 15 minutes. Open it and select Continue; no password is needed. You can request up to three links per email address each hour.</p>
    <button type="submit" className="rd-v2-btn sm primary" disabled={busy}>{busy ? "Requesting link…" : notice ? "Request another link" : "Email me a sign-in link"}</button>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </form>;
}
