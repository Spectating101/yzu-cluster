import { useEffect, useState } from "react";
import { fetchJson } from "@/v2/apiCore";
import { StatementSection } from "@/v2/ui";
import { buildProviderRequest, defaultProviderRequest, providerFieldLabels } from "@/v2/providerRequests";
import "./providerConnections.css";

const base = "/library/provider-connections";
const stateLabel = { prepared: "Review registration", verification_required: "Verification required", unverified: "Unverified", connected: "Verified access", expired: "Check access again", revoked: "Disconnected" };

export function ProviderConnectionsSection({ deskAccess, onToast }) {
  const allowed = Boolean(deskAccess?.permissions?.submit_collection);
  const actor = deskAccess?.principal?.id || deskAccess?.user?.id || "";
  const [document, setDocument] = useState(null);
  const [provider, setProvider] = useState("bls");
  const [registration, setRegistration] = useState({ email: "", institution: "" });
  const [url, setUrl] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [credentials, setCredentials] = useState({});
  const [request, setRequest] = useState({});
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const connections = (document?.connections || []).filter(row => row.state !== "revoked");
  const selected = connections.find(row => row.id === selectedId);
  const config = document?.providers?.find(row => row.id === (selected?.provider || provider));

  useEffect(() => {
    setDocument(null); setSelectedId(""); setCredentials({}); setPlan(null); setError("");
    if (!allowed) return;
    const abort = new AbortController();
    fetchJson(base, { signal: abort.signal }).then(out => {
      if (out.ok === false || !Array.isArray(out.providers) || !Array.isArray(out.connections)) throw new Error(out.error || "Data provider setup is not available on this desk yet.");
      setDocument(out);
    }).catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [allowed, actor]);

  useEffect(() => {
    setCredentials({}); setPlan(null); setMessage("");
    setRequest(defaultProviderRequest(selected?.provider || provider, selected?.url || url));
  }, [selectedId, provider]); // Reset sensitive drafts when switching accounts.

  async function run(action, payload = {}) {
    setBusy(action); setError(""); setMessage("");
    try {
      const path = action === "prepare" ? `${base}/prepare` : `${base}/${selectedId}/${action}`;
      const out = await fetchJson(path, { method: "POST", body: JSON.stringify(payload), timeoutMs: 150000 });
      if (out.ok === false) throw new Error(out.error || "Provider operation failed");
      if (out.plan && action === "plan") setPlan(out.plan);
      if (out.job) { setPlan(null); setMessage("Collection submitted for approval. Track its progress in Library."); onToast?.("Provider collection submitted for approval"); }
      if (out.connection) {
        setDocument(current => ({ ...current, connections: [...(current?.connections || []).filter(row => row.id !== out.connection.id), out.connection] }));
        setSelectedId(out.connection.state === "revoked" ? "" : out.connection.id);
        if (action === "credentials") setCredentials({});
        if (action === "verify") setMessage(out.connection.state === "connected" ? "Access verified with usable provider observations." : out.connection.failure_note || "Access has not been verified.");
      }
      return out;
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }

  const boundedRequest = () => buildProviderRequest(selected.provider, request);
  return <StatementSection title="Data provider accounts"><div className="rd-provider-section">
    <p className="rd-v2-settings-hint">Connect your named data accounts. Verify access with a small request, then reuse the connection for collection.</p>
    {!allowed ? <p className="rd-v2-settings-hint">A member account with collection access is required to manage data providers.</p> : <>
      {!document && !error ? <p role="status">Loading provider connections…</p> : null}
      {connections.length ? <ul className="rd-provider-list">
        {connections.map(row => <li key={row.id}>
          <button type="button" className="rd-v2-btn sm ghost" aria-pressed={selectedId === row.id} onClick={() => setSelectedId(row.id)} disabled={Boolean(busy)}>{row.label}</button>
          <span>{stateLabel[row.state] || "Needs a check"}</span>
          {row.verified_at ? <small>Checked {new Date(row.verified_at * 1000).toLocaleDateString()}</small> : null}
        </li>)}
      </ul> : null}
      {!selected && document ? <div className="rd-provider-form">
        <label>Provider<select className="rd-v2-select" value={provider} onChange={event => setProvider(event.target.value)}>
          {document.providers.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select></label>
        {provider === "browser" ? <label>Website URL<input className="rd-v2-input" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label> : <>
          <label>Registration email (optional)<input className="rd-v2-input" type="email" autoComplete="email" value={registration.email} onChange={event => setRegistration({ ...registration, email: event.target.value })} /></label>
          <label>Institution (optional)<input className="rd-v2-input" value={registration.institution} onChange={event => setRegistration({ ...registration, institution: event.target.value })} /></label>
        </>}
        <p className="rd-v2-settings-hint rd-provider-wide">{config?.note}</p>
        <button type="button" className="rd-v2-btn sm primary" disabled={Boolean(busy) || (provider === "browser" && !url)} onClick={() => run("prepare", { provider, registration, url })}>{busy === "prepare" ? "Preparing…" : "Set up connection"}</button>
      </div> : null}
      {selected ? <div className="rd-provider-detail">
        <h3>{selected.label} <span>{stateLabel[selected.state]}</span></h3>
        <p className="rd-v2-settings-hint">{config?.note}</p>
        {selected.state === "prepared" ? <div className="rd-provider-review">
          <p>Review the registration destination and details before continuing.</p>
          {selected.registration?.email ? <p>Email: {selected.registration.email}</p> : null}
          {selected.registration?.institution ? <p>Institution: {selected.registration.institution}</p> : null}
          {selected.signup_url ? <a href={selected.signup_url} target="_blank" rel="noopener noreferrer">Provider registration page ↗</a> : <p>{selected.url}</p>}
          <button type="button" className="rd-v2-btn sm" disabled={Boolean(busy)} onClick={() => run("confirm", { confirmed: true })}>Confirm setup details</button>
        </div> : null}
        {selected.state === "verification_required" ? <p className="rd-v2-settings-hint">Complete the provider's email, institutional approval, or sign-in step. This connection is waiting for verification.</p> : null}
        {selected.signup_url && selected.state !== "prepared" ? <p><a href={selected.signup_url} target="_blank" rel="noopener noreferrer">Open provider registration / sign-in ↗</a></p> : null}
        <div className="rd-provider-actions">
          {selected.state !== "prepared" ? <>
            <button type="button" className="rd-v2-btn sm ghost" disabled={Boolean(busy)} onClick={() => run("browser", { action: "open" })}>Open managed browser</button>
            <button type="button" className="rd-v2-btn sm ghost" disabled={Boolean(busy)} onClick={() => run("browser", { action: "resume" })}>Resume after verification</button>
            {selected.provider === "bls" ? <button type="button" className="rd-v2-btn sm ghost" disabled={Boolean(busy)} onClick={() => run("browser", { action: "submit_bls", confirmed: true })}>Submit reviewed BLS registration</button> : null}
          </> : null}
        </div>
        {selected.state !== "prepared" ? <p className="rd-v2-settings-hint">The managed browser opens on {selected.worker}. Finish visible verification steps there, then resume here.</p> : null}
        {selected.provider !== "browser" ? <form className="rd-provider-form" onSubmit={event => { event.preventDefault(); run("credentials", { credentials }); }}>
          {Object.entries(config?.fields || {}).map(([key, label]) => <label key={key}>{label}<input className="rd-v2-input" type="password" autoComplete="off" value={credentials[key] || ""} onChange={event => setCredentials({ ...credentials, [key]: event.target.value })} /></label>)}
          <p className="rd-v2-settings-hint rd-provider-wide">Credentials are encrypted on the executing host. Saving them does not verify access.</p>
          <button type="submit" className="rd-v2-btn sm" disabled={Boolean(busy) || Object.keys(config?.fields || {}).some(key => !credentials[key]?.trim())}>Save credentials</button>
        </form> : null}
        <h4>Check access and collect</h4>
        <p className="rd-v2-settings-hint">Choose the exact series or entities you need. Verify runs at most two provider requests and 200 rows. Collection uses the same bounds, with a 10,000-row cap.</p>
        <div className="rd-provider-form">
          {Object.entries(request).map(([key, value]) => <label key={key}>{providerFieldLabels[key]}{key === "table" ? <select className="rd-v2-select" value={value} onChange={event => { setRequest({ ...request, [key]: event.target.value }); setPlan(null); }}><option value="comp.funda">Compustat annual fundamentals</option><option value="crsp.msf">CRSP monthly stocks</option></select> : <input className="rd-v2-input" value={value} onChange={event => { setRequest({ ...request, [key]: event.target.value }); setPlan(null); }} />}</label>)}
        </div>
        {selected.failure_note ? <p className="rd-provider-error">{selected.failure_note}</p> : null}
        {selected.verification ? <p className="rd-v2-settings-hint">Last check: {selected.verification.rows} rows · {selected.verification.usable_cells} usable cells · {selected.verification.coverage} coverage within the check.</p> : null}
        <div className="rd-provider-actions">
          <button type="button" className="rd-v2-btn sm" disabled={Boolean(busy) || selected.state === "prepared"} onClick={() => run("verify", { request: boundedRequest() })}>{busy === "verify" ? "Checking access…" : "Verify access"}</button>
          <button type="button" className="rd-v2-btn sm primary" disabled={Boolean(busy) || selected.state !== "connected"} onClick={() => run("plan", { request: boundedRequest() })}>Prepare collection</button>
        </div>
        {plan ? <div className="rd-provider-review"><p>{plan.title}</p><p>Submit this bounded request for collection approval. The result will be added to Library after collection and validation.</p><button type="button" className="rd-v2-btn sm primary" disabled={Boolean(busy)} onClick={() => run("collect", { request: boundedRequest(), confirmed: true })}>Submit collection for approval</button></div> : null}
        <div className="rd-provider-actions">
          <button type="button" className="rd-v2-btn sm ghost" disabled={Boolean(busy)} onClick={() => setSelectedId("")}>Set up another provider</button>
          <button type="button" className="rd-v2-btn sm danger" disabled={Boolean(busy)} onClick={() => run("revoke")}>Disconnect and erase credentials</button>
        </div>
      </div> : null}
    </>}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p className="rd-provider-error" role="alert">{error}</p> : null}
  </div></StatementSection>;
}
