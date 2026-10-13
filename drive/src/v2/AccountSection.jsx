import { useEffect, useState } from "react";
import { ACCOUNT_ROLES, accountUsage, changeDeskAccount, listDeskAccounts } from "./accountApi.js";
import { StatementSection } from "@/v2/ui";
import "./accounts.css";

export function AccountSection({ deskAccess, onSignOut }) {
  const actor = deskAccess?.principal;
  const signedIn = Boolean(deskAccess?.permissions?.use_ask);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState("");
  const reload = () => accountUsage().then(setUsage).catch((e) => setError(e.message));
  useEffect(() => {
    if (!signedIn) return undefined;
    let current = true;
    accountUsage().then((out) => { if (current) setUsage(out); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [actor?.id, signedIn]);
  return <StatementSection title="Your account">
    <div className="rd-account-summary">
      <strong>{signedIn ? actor?.display_name || actor?.email || "Researcher" : "Guest browsing"}</strong>
      <span>{ACCOUNT_ROLES[actor?.role] || "Signed out"}{signedIn && actor?.email ? ` · ${actor.email}` : ""}</span>
      <p>{signedIn ? "Your profile, Ask conversations and research threads belong to this account. The shared Library is available to other researchers. Operators can inspect saved research work." : "Browse Library and Discover freely. Sign in with your invitation to use Ask and keep a personal research trail."}</p>
      {signedIn ? <>
        <p>{deskAccess?.permissions?.submit_collection ? "You can connect providers and submit collections. Approval follows the desk’s collection policy." : "You can reason over shared evidence and save research work. A lab member handles provider connections and collection requests."}</p>
        <button type="button" className="rd-v2-btn sm ghost" onClick={onSignOut}>Sign out of this browser</button>
        <p className="rd-v2-settings-hint">Your saved work and connected providers remain available when you sign back in. For a lost invitation, ask an operator for a replacement for this same account.</p>
      </> : null}
    </div>
    {signedIn ? <div className="rd-account-usage" aria-label="Assistant allowance">
      <h3>Shared assistant allowance</h3>
      {usage ? <p><strong>{usage.hourly_remaining} / {usage.limits.hourly_requests}</strong> requests remaining this hour · <strong>{usage.daily_remaining} / {usage.limits.daily_requests}</strong> in the last 24 hours{usage.running_requests ? ` · ${usage.running_requests} running` : ""}</p> : <p>{error ? "Allowance unavailable" : "Checking allowance…"}</p>}
      <p className="rd-v2-settings-hint">Counts Ask, advice and assistant warm-up requests. AI capacity is supplied by the desk; these numbers are request limits, not your provider token balance. Browsing stays available when the allowance is used.</p>
      <button type="button" className="rd-v2-btn sm ghost" onClick={reload}>Refresh allowance</button>
      {error ? <p role="alert">{error}</p> : null}
    </div> : null}
  </StatementSection>;
}

export function AccountAdministration({ deskAccess }) {
  const [document, setDocument] = useState(null);
  const [draft, setDraft] = useState({ id: "", display_name: "", email: "", role: "public_member" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(null);
  const operator = deskAccess?.principal?.role === "operator";
  useEffect(() => {
    if (!operator) return undefined;
    let current = true;
    listDeskAccounts().then((out) => { if (current) setDocument(out); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [operator]);
  if (!operator) return null;
  const run = async (payload) => {
    setBusy(true); setError(""); setInvitation(null);
    try {
      const out = await changeDeskAccount(payload);
      if (out.access_code) setInvitation({ id: out.account.id, code: out.access_code });
      setPending(null);
      if (payload.action === "create" || editing) {
        setDraft({ id: "", display_name: "", email: "", role: "public_member" });
        setEditing(false);
      }
      setDocument(await listDeskAccounts());
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const patch = (key, value) => setDraft((row) => ({ ...row, [key]: value }));
  return <StatementSection title="Researcher access">
    <p className="rd-v2-settings-hint">Issue an individual invitation for each person. Replacement invitations and access changes end their earlier sessions without deleting their research work.</p>
    {document?.configured === false ? <p role="status">A private account registry must be configured before invitations can be issued.</p> : null}
    <form className="rd-account-form" onSubmit={(event) => { event.preventDefault(); if (editing) setPending({ action: "update", ...draft, label: `Update ${draft.id}’s account details` }); else run({ action: "create", ...draft }); }}>
      <label>Account ID<input className="rd-v2-input" readOnly={editing} required minLength={2} maxLength={96} pattern="[A-Za-z0-9][A-Za-z0-9._-]+" value={draft.id} onChange={(e) => patch("id", e.target.value)} autoComplete="off" /></label>
      <label>Display name<input className="rd-v2-input" required maxLength={160} value={draft.display_name} onChange={(e) => patch("display_name", e.target.value)} /></label>
      <label>Email (optional)<input className="rd-v2-input" type="email" maxLength={320} value={draft.email} onChange={(e) => patch("email", e.target.value)} /></label>
      <label>Access<select className="rd-v2-select" value={draft.role} onChange={(e) => patch("role", e.target.value)}>{["public_member", "member", "operator"].map((role) => <option key={role} value={role}>{ACCOUNT_ROLES[role]}</option>)}</select></label>
      <p className="rd-account-wide rd-v2-settings-hint">Researcher: Ask and saved work. Lab member: provider connections and collections. Operator: approvals, account administration and operations.</p>
      <button type="submit" className="rd-v2-btn sm primary" disabled={busy || !document?.configured}>{busy ? "Saving…" : editing ? "Review account changes" : "Issue invitation"}</button>
      {editing ? <button type="button" className="rd-v2-btn sm ghost" onClick={() => { setEditing(false); setDraft({ id: "", display_name: "", email: "", role: "public_member" }); setPending(null); }}>Cancel editing</button> : null}
    </form>
    {invitation ? <div className="rd-account-invitation" role="status">
      <strong>Invitation for {invitation.id}</strong>
      <p>Copy and send this privately. It will not be shown again.</p>
      <label htmlFor="rd-issued-invitation">Member access code</label>
      <textarea id="rd-issued-invitation" readOnly value={invitation.code} onFocus={(event) => event.target.select()} />
      <button type="button" className="rd-v2-btn sm ghost" onClick={() => setInvitation(null)}>I’ve saved the invitation</button>
    </div> : null}
    <ul className="rd-account-list" aria-label="Desk accounts">
      {(document?.accounts || []).map((account) => <li key={account.id}>
        <div><strong>{account.display_name || account.id}</strong><span>{account.id} · {ACCOUNT_ROLES[account.role]} · {account.enabled ? "Active" : "Disabled"}{account.daily_requests != null ? ` · ${account.daily_requests} assistant requests in 24h` : ""}</span></div>
        {account.manageable !== false && account.id !== deskAccess?.principal?.id ? <div className="rd-account-actions">
          <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={() => { setEditing(true); setInvitation(null); setPending(null); setDraft({ id: account.id, display_name: account.display_name || "", email: account.email || "", role: account.role }); }}>Edit details</button>
          <select aria-label={`Access for ${account.id}`} className="rd-v2-select" value={account.role} disabled={busy} onChange={(event) => setPending({ action: "update", id: account.id, role: event.target.value, label: `Change ${account.id} to ${ACCOUNT_ROLES[event.target.value]}` })}>{["public_member", "member", "operator"].map((role) => <option key={role} value={role}>{ACCOUNT_ROLES[role]}</option>)}</select>
          <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={() => setPending({ action: "rotate_code", id: account.id, label: `Replace ${account.id}’s invitation and end earlier sessions` })}>Replace invitation</button>
          <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={() => setPending({ action: "revoke_sessions", id: account.id, label: `End all sessions for ${account.id}` })}>End sessions</button>
          <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={() => setPending({ action: "update", id: account.id, enabled: !account.enabled, label: `${account.enabled ? "Disable" : "Enable"} ${account.id}’s access` })}>{account.enabled ? "Disable access" : "Enable access"}</button>
        </div> : <span>{account.id === deskAccess?.principal?.id ? "Your account · another operator manages access changes" : "Managed through the service or identity provider"}</span>}
      </li>)}
    </ul>
    {document && !document.accounts?.length ? <p>No individually invited accounts yet.</p> : null}
    {pending ? <div className="rd-account-confirm" role="group" aria-label="Review access change"><p>{pending.label}? Saved research work will be preserved.</p><button className="rd-v2-btn sm primary" type="button" disabled={busy} onClick={() => { const { label, ...payload } = pending; run(payload); }}>Confirm change</button><button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </StatementSection>;
}
