import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeConnectedAccountOauth,
  disconnectConnectedAccount,
  listConnectedAccounts,
  startConnectedAccountOauth,
  verifyConnectedAccount,
} from "@/v2/connectedAccountsApi";
import { StatementRow, StatementSection } from "@/v2/ui";

const CONNECTED_ROLES = new Set(["member", "operator"]);

function cleanOauthParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of [
      "rd_storage_oauth",
      "code",
      "state",
      "error",
      "error_description",
      "session_state",
    ]) {
      params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`,
    );
  } catch {
    /* URL cleanup is non-critical. */
  }
}

function connectionLabel(account) {
  if (account?.email) return account.email;
  return account?.label || "Connected account";
}

function accessLabel(mode) {
  if (mode === "index") return "Index";
  if (mode === "write") return "Read + write";
  return "Read";
}

function providerStatus(provider, accounts) {
  if (accounts.length) return `${accounts.length} connected`;
  if (!provider?.configured) return "Server setup required";
  if (!provider?.rclone_available) return "Storage adapter unavailable";
  return "Ready to connect";
}

export function ConnectedAccountsSection({ deskAccess, onToast }) {
  const role = String(deskAccess?.principal?.role || "");
  const canConnect = Boolean(deskAccess?.authenticated && CONNECTED_ROLES.has(role));
  const principalId = String(deskAccess?.principal?.id || "");
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [modes, setModes] = useState({});
  const callbackHandled = useRef(false);

  const refresh = useCallback(async () => {
    if (!canConnect) {
      setDocument(null);
      setError("");
      return null;
    }
    setLoading(true);
    try {
      const next = await listConnectedAccounts();
      setDocument(next);
      setError("");
      setModes((current) => {
        const patched = { ...current };
        for (const provider of next?.providers || []) {
          if (!patched[provider.id]) patched[provider.id] = provider.default_access_mode || "read";
        }
        return patched;
      });
      return next;
    } catch (loadError) {
      setError(String(loadError?.message || loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [canConnect]);

  useEffect(() => {
    refresh();
  }, [principalId, refresh]);

  useEffect(() => {
    if (!canConnect || callbackHandled.current) return;
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const provider = params.get("rd_storage_oauth") || "";
    if (!provider) return;
    callbackHandled.current = true;
    const providerError = params.get("error") || "";
    const providerErrorDescription = params.get("error_description") || "";
    const code = params.get("code") || "";
    const state = params.get("state") || "";

    if (providerError) {
      const message = providerErrorDescription || providerError;
      setError(`Connection was not completed: ${message}`);
      onToast?.(`Storage connection was not completed: ${message}`);
      cleanOauthParams();
      return;
    }
    if (!code || !state) {
      setError("Storage provider returned an incomplete authorization response.");
      cleanOauthParams();
      return;
    }

    setBusyKey(`callback:${provider}`);
    completeConnectedAccountOauth(provider, state, code)
      .then((result) => {
        const account = result?.account;
        onToast?.(`${account?.label || "Storage account"} connected`);
        return refresh();
      })
      .catch((completeError) => {
        setError(String(completeError?.message || completeError));
      })
      .finally(() => {
        cleanOauthParams();
        setBusyKey("");
      });
  }, [canConnect, onToast, refresh]);

  const accounts = Array.isArray(document?.accounts) ? document.accounts : [];
  const providers = Array.isArray(document?.providers) ? document.providers : [];
  const accountsByProvider = useMemo(() => {
    const grouped = new Map();
    for (const account of accounts) {
      const key = String(account?.provider || "");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(account);
    }
    return grouped;
  }, [accounts]);

  const connect = async (provider) => {
    const mode = modes[provider.id] || provider.default_access_mode || "read";
    setBusyKey(`connect:${provider.id}`);
    setError("");
    try {
      const started = await startConnectedAccountOauth(provider.id, mode);
      if (!started?.authorize_url) throw new Error("Provider did not return an authorization URL");
      window.location.assign(started.authorize_url);
    } catch (connectError) {
      setError(String(connectError?.message || connectError));
      setBusyKey("");
    }
  };

  const verify = async (account) => {
    setBusyKey(`verify:${account.id}`);
    setError("");
    try {
      const result = await verifyConnectedAccount(account.id);
      onToast?.(`${result?.account?.label || account.label || "Storage account"} verified`);
      await refresh();
    } catch (verifyError) {
      setError(String(verifyError?.message || verifyError));
    } finally {
      setBusyKey("");
    }
  };

  const disconnect = async (account) => {
    setBusyKey(`disconnect:${account.id}`);
    setError("");
    try {
      await disconnectConnectedAccount(account.id);
      onToast?.(`${account.label || "Storage account"} disconnected`);
      await refresh();
    } catch (disconnectError) {
      setError(String(disconnectError?.message || disconnectError));
    } finally {
      setBusyKey("");
    }
  };

  return (
    <>
      <StatementSection title="Account">
        {deskAccess?.authenticated ? (
          <>
            <StatementRow
              label={deskAccess?.principal?.display_name || deskAccess?.principal?.email || "Research Drive account"}
              metric={role || "member"}
              sublabel={deskAccess?.principal?.email || `Account ${principalId || "authenticated"}`}
              detail="SIGNED IN"
            />
            <p className="rd-v2-settings-hint">
              This account owns private work and connected storage. The faculty identity below is a research record and remains separate.
            </p>
          </>
        ) : (
          <p className="rd-v2-settings-hint">
            Connect this browser to a named Research Drive account before linking personal storage.
          </p>
        )}
      </StatementSection>

      <StatementSection title="Connected storage">
        <div className="rd-v2-connected-intro">
          <p>
            Bring external storage into one evidence estate without copying everything into Research Drive. Multiple accounts from the same provider are supported.
          </p>
          <span>Credentials stay server-side</span>
        </div>

        {!canConnect ? (
          <p className="rd-v2-settings-hint" data-testid="connected-accounts-unavailable">
            Connected storage is available to named member and operator accounts. Guest/public sessions never receive cloud-account authority.
          </p>
        ) : loading && !document ? (
          <p className="rd-v2-settings-hint">Reading connected accounts…</p>
        ) : (
          <div className="rd-v2-connected-providers" data-testid="connected-accounts">
            {providers.map((provider) => {
              const providerAccounts = accountsByProvider.get(provider.id) || [];
              const providerBusy = busyKey === `connect:${provider.id}`;
              const connectable = provider.configured && provider.rclone_available;
              const selectedMode = modes[provider.id] || provider.default_access_mode || "read";
              return (
                <article className="rd-v2-connected-provider" key={provider.id} data-provider={provider.id}>
                  <header>
                    <div>
                      <strong>{provider.label}</strong>
                      <span>{providerStatus(provider, providerAccounts)}</span>
                    </div>
                    <div className="rd-v2-connected-connect">
                      <select
                        className="rd-v2-select rd-v2-connected-mode"
                        aria-label={`${provider.label} access`}
                        value={selectedMode}
                        disabled={!connectable || providerBusy}
                        onChange={(event) =>
                          setModes((current) => ({ ...current, [provider.id]: event.target.value }))
                        }
                      >
                        <option value="index">
                          {provider.supports_index_only ? "Index only" : "Index (read-only)"}
                        </option>
                        <option value="read">Read files</option>
                        <option value="write">Read + write</option>
                      </select>
                      <button
                        type="button"
                        className="rd-v2-btn sm primary"
                        disabled={!connectable || Boolean(busyKey)}
                        onClick={() => connect(provider)}
                      >
                        {providerAccounts.length ? "Connect another" : "Connect"}
                      </button>
                    </div>
                  </header>

                  {providerAccounts.length ? (
                    <ul className="rd-v2-connected-accounts-list">
                      {providerAccounts.map((account) => (
                        <li key={account.id} data-testid={`connected-account-${account.id}`}>
                          <div className="rd-v2-connected-account-copy">
                            <strong>{account.label || connectionLabel(account)}</strong>
                            <span>{connectionLabel(account)} · {accessLabel(account.access_mode)}</span>
                            <small>
                              {account.verified_at
                                ? `Verified ${new Date(account.verified_at).toLocaleString()}`
                                : "Connected · verification not run yet"}
                            </small>
                          </div>
                          <div className="rd-v2-connected-account-actions">
                            <button
                              type="button"
                              className="rd-v2-btn sm ghost"
                              disabled={Boolean(busyKey)}
                              onClick={() => verify(account)}
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              className="rd-v2-btn sm danger"
                              disabled={Boolean(busyKey)}
                              onClick={() => disconnect(account)}
                            >
                              Disconnect
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {!provider.configured ? (
                    <p className="rd-v2-connected-provider-note">
                      OAuth application credentials are not configured on this Research Drive host.
                    </p>
                  ) : !provider.rclone_available ? (
                    <p className="rd-v2-connected-provider-note">
                      The storage byte adapter is unavailable on this host.
                    </p>
                  ) : provider.id === "onedrive" && selectedMode === "index" ? (
                    <p className="rd-v2-connected-provider-note">
                      Microsoft does not expose delegated metadata-only file access; OneDrive indexing therefore uses read-only Files.Read.
                    </p>
                  ) : selectedMode === "write" ? (
                    <p className="rd-v2-connected-provider-note">
                      Write authority is explicit. Use it only when Research Drive should be allowed to change upstream files.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {error ? (
          <p className="rd-v2-connected-error" role="alert">
            {error}
          </p>
        ) : null}
        {canConnect && !loading && document && providers.length === 0 ? (
          <p className="rd-v2-settings-hint">No storage providers are configured on this host.</p>
        ) : null}
      </StatementSection>
    </>
  );
}
