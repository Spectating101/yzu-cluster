import { useEffect, useId, useState } from "react";
import { fetchJson } from "./apiCore.js";
import { clearDeskToken, markDeskSessionBootstrapped, notifyDeskIdentityChange } from "./deskSession.js";
import "./accounts.css";

export function readEmailLinkFragment() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#desk-email=")) return null;
  const token = window.location.hash.slice("#desk-email=".length);
  // Remove it before the app performs telemetry, data requests or routing.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export function EmailLinkConfirmation({ token, onCancel }) {
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
      window.location.replace("/?tab=home");
    } catch (reason) { setError(reason.message); setBusy(false); }
  };
  return <main className="rd-v2-access-gate"><section className="rd-v2-access-card" aria-labelledby="rd-email-confirm-title">
    <span className="rd-v2-access-kicker">RESEARCH DRIVE</span>
    <h1 id="rd-email-confirm-title">Continue with your email link</h1>
    {target ? <p>Account: <strong>{target.email}</strong></p> : !error ? <p role="status">Checking the link…</p> : null}
    <p>This signs this browser into the account that requested the link. If you are already signed in, it replaces that browser session. Recovery ends earlier sessions.</p>
    <button type="button" className="rd-v2-btn primary" disabled={busy || Boolean(error) || !target} onClick={complete}>{busy ? "Verifying…" : "Continue to Research Drive"}</button>
    <button type="button" className="rd-v2-btn ghost" disabled={busy} onClick={onCancel}>Return to sign in</button>
    {error ? <p role="alert">{error}</p> : null}
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
