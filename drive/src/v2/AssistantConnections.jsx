import { useEffect, useId, useState } from "react";
import { fetchJson } from "./apiCore.js";
import { connectorReturnPath } from "./connectorReturn.js";
import { StatementSection } from "@/v2/ui";

const endpoint = "/library/account/tokens";
const date = (seconds) => new Date(seconds * 1000).toLocaleDateString();

export function AssistantConnections({ onOpenAccess }) {
  const secretId = useId();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(false);
  const [datasetIds, setDatasetIds] = useState("");
  const [secret, setSecret] = useState(null);
  const [pending, setPending] = useState(null);
  const [copied, setCopied] = useState(false);
  const fail = (reason) => { setError(reason.message); setReauth(reason.code === "reauthentication_required"); };
  useEffect(() => {
    let current = true;
    fetchJson(endpoint).then((out) => { if (current) setDocument(out); }).catch((reason) => { if (current) fail(reason); });
    return () => { current = false; };
  }, []);
  const reload = async () => {
    setBusy(true); setError(""); setReauth(false);
    try { setDocument(await fetchJson(endpoint)); } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const change = async (payload) => {
    setBusy(true); setError(""); setReauth(false); setCopied(false);
    try {
      const out = await fetchJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
      if (out.token) { setSecret(out); setLabel(""); }
      else if (secret?.id === payload.id) setSecret(null);
      setPending(null);
      setDocument(await fetchJson(endpoint));
    } catch (reason) { fail(reason); }
    finally { setBusy(false); }
  };
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); }
    catch { setError("Copy was unavailable. Select the value and copy it manually."); }
  };
  const returnPath = connectorReturnPath();
  return <StatementSection title="External assistants and personal tokens">
    <p>Use your own assistant to read datasets approved for external sharing. These connections cannot collect data, approve jobs or spend the desk’s assistant allowance.</p>
    {returnPath ? <p><a className="rd-v2-btn sm" href={returnPath}>Continue connecting your assistant</a></p> : null}
    {!document && !error ? <p role="status">Loading connections…</p> : null}
    {document?.configured === false ? <p role="status">External assistant connections are not enabled on this desk yet.</p> : null}
    {document?.configured ? <>
      <label className="rd-connector-endpoint">MCP connector address<input className="rd-v2-input" readOnly value={document.resource} onFocus={(event) => event.target.select()} /></label>
      <p className="rd-v2-settings-hint">{document.oauth_enabled ? "Add this address in an assistant that supports MCP sign-in. Review its return address and permissions before allowing access." : "This connector currently uses a personal bearer token. Use a client that accepts an Authorization header."} Only explicitly shared datasets are available; licensed and private rows stay restricted.</p>
      <h3>Connected assistants</h3>
      <ul className="rd-account-list" aria-label="Connected assistants">
        {(document.connections || []).map((item) => <li key={item.id}>
          <div><strong>{item.label}</strong><span>{item.active ? `Connected · expires ${date(item.expires_at)}` : "Disconnected or expired"} · {item.scopes.includes("data:read") ? "Shared rows and catalogue" : "Catalogue only"}</span></div>
          {item.active ? <button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={() => setPending({ action: "revoke_connection", id: item.id, label: item.label })}>Disconnect</button> : null}
        </li>)}
      </ul>
      {!document.connections?.length ? <p>No assistants connected.</p> : null}
      <h3>Personal tokens</h3>
      <p className="rd-v2-settings-hint">For clients that accept a bearer token. Each secret is shown once. Revoking it stops that client; signing out of this browser does not disconnect your clients.</p>
      <form className="rd-account-form" aria-label="Create personal token" onSubmit={(event) => {
        event.preventDefault();
        const ids = datasetIds.trim() ? datasetIds.split(/[\s,]+/).filter(Boolean) : null;
        change({ action: "create", label, expires_in_days: days, scopes: rows ? ["catalog:read", "data:read"] : ["catalog:read"], ...(ids ? { dataset_ids: ids } : {}) });
      }}>
        <label>Client label<input className="rd-v2-input" required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="My research client" /></label>
        <label>Expires in<select className="rd-v2-select" value={days} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((value) => <option key={value} value={value}>{value} days</option>)}</select></label>
        <label className="rd-account-wide"><input type="checkbox" checked={rows} onChange={(event) => setRows(event.target.checked)} /> Allow reading bounded rows from shared datasets</label>
        <label className="rd-account-wide">Dataset IDs (optional)<input className="rd-v2-input" maxLength={16000} value={datasetIds} onChange={(event) => setDatasetIds(event.target.value)} placeholder="Leave blank for all datasets approved for sharing" /></label>
        <button className="rd-v2-btn sm primary" type="submit" disabled={busy || Boolean(secret)}>{busy ? "Saving…" : "Create personal token"}</button>
      </form>
      {secret ? <div className="rd-account-invitation" role="group" aria-label="New personal token">
        <p>Copy this secret now. It will not be shown again. Keep it private.</p>
        <label htmlFor={secretId}>Personal token</label>
        <textarea id={secretId} readOnly value={secret.token} onFocus={(event) => event.target.select()} spellCheck={false} />
        <button className="rd-v2-btn sm" type="button" onClick={() => copy(secret.token)}>{copied ? "Copied" : "Copy token"}</button>
        <button className="rd-v2-btn sm ghost" type="button" onClick={() => { setSecret(null); setCopied(false); }}>I’ve saved the token</button>
      </div> : null}
      <ul className="rd-account-list" aria-label="Personal tokens">
        {(document.tokens || []).map((item) => <li key={item.id}>
          <div><strong>{item.label}</strong><span>{item.active ? `Active · expires ${date(item.expires_at)}` : "Revoked or expired"} · {item.scopes.includes("data:read") ? "Shared rows and catalogue" : "Catalogue only"}{item.dataset_ids ? ` · ${item.dataset_ids.length} selected datasets` : ""}</span></div>
          {item.active ? <button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={() => setPending({ action: "revoke", id: item.id, label: item.label })}>Revoke token</button> : null}
        </li>)}
      </ul>
      {!document.tokens?.length ? <p>No personal tokens.</p> : null}
      <button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={reload}>Refresh connections</button>
    </> : null}
    {pending ? <div className="rd-account-confirm" role="group" aria-label="Confirm disconnect">
      <p>{pending.action === "revoke_connection" ? "Disconnect" : "Revoke token for"} {pending.label}? This stops its access without deleting your research work.</p>
      <button className="rd-v2-btn sm primary" type="button" disabled={busy} onClick={() => change({ action: pending.action, id: pending.id })}>Confirm disconnect</button>
      <button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {reauth && onOpenAccess ? <button className="rd-v2-btn sm" type="button" onClick={() => onOpenAccess("signin")}>Sign in again</button> : null}
    {error && !document ? <button className="rd-v2-btn sm ghost" type="button" disabled={busy} onClick={reload}>Retry connections</button> : null}
  </StatementSection>;
}
