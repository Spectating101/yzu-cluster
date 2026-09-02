import { useState } from "react";
import {
  clearDeskToken,
  deskSessionBootstrapped,
  hasDeskToken,
  saveDeskToken,
  saveUserEmail,
} from "@/v2/deskSession";
import { clearDeskSession, ensureDeskSession } from "@/v2/api";
import { ConnectedAccountsSection } from "@/v2/ConnectedAccountsSection";
import { archiveRuntimeStatus } from "@/v2/archiveRuntimeStatus";
import { assistantRuntimeDetail, composerRuntimeRead } from "@/v2/composerRuntimeStatus";
import { loadSettings, saveSettings } from "@/v2/settingsStore";
import { PILOT_PREVIEW_EMAIL } from "@/v2/profileViewModel";
import { PageShell, StatementRow } from "@/v2/ui";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";

const SETTINGS_SURFACE_STATE = "ready";

function isDemoMode() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

function deskAccessStatus(health, deskAccess) {
  const desk = health?.desk || {};
  if (deskAccess?.authenticated) {
    return {
      ok: true,
      label: "Connected",
      detail: deskAccess?.session?.mode === "token" ? "Session fallback" : "Browser session",
    };
  }
  if (hasDeskToken()) return { ok: true, label: "Connected", detail: "Session fallback" };
  if (deskSessionBootstrapped() || desk.desk_session_cookie) {
    return { ok: true, label: "Connected", detail: "Browser session" };
  }
  if (desk.desk_token_required) {
    return { ok: false, label: "Needs connection", detail: "Authorization required" };
  }
  return { ok: true, label: "Open", detail: "No write token required" };
}

function assistantStatus(health) {
  if (health == null) {
    return {
      ready: false,
      known: false,
      label: "Not checked",
      detail: "Open system status to inspect runtime health",
    };
  }
  const desk = health?.desk || {};
  const runtime = composerRuntimeRead(desk.composer_runtime);
  if (runtime) {
    return {
      ready: runtime.ready,
      known: true,
      label: runtime.short,
      detail: assistantRuntimeDetail(desk, runtime),
    };
  }
  if (desk.composer_configured === true || desk.legacy_llm_configured === true) {
    return {
      ready: true,
      known: true,
      label: "Configured",
      detail: desk.composer_model ? `${desk.composer_model} runtime` : "Assistant configured",
    };
  }
  if (desk.composer_configured === false) {
    return {
      ready: false,
      known: true,
      label: "Needs setup",
      detail: "Assistant reports offline",
    };
  }
  return {
    ready: false,
    known: false,
    label: "Not reported",
    detail: "No assistant runtime signal",
  };
}

function SettingsRow({ title, description, children }) {
  return (
    <div className="rd-v2-settings-simple-row">
      <div className="rd-v2-settings-simple-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="rd-v2-settings-simple-control">{children}</div>
    </div>
  );
}

function SettingsSection({ id, title, description, children }) {
  return (
    <section id={id} className="rd-v2-settings-simple-section" aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="rd-v2-settings-simple-list">{children}</div>
    </section>
  );
}

export function SettingsPage({
  health,
  deskAccess,
  resourcesRollup,
  onProfileRefresh,
  onToast,
  onSettingsChange,
}) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [emailDraft, setEmailDraft] = useState(() => settings.email || "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const access = deskAccessStatus(health, deskAccess);
  const assistant = assistantStatus(health);
  const demoMode = isDemoMode();
  const archive = archiveRuntimeStatus(health);
  const mcpTools = resourcesRollup?.ai?.mcp_tools?.total ?? resourcesRollup?.hero?.mcp_tools ?? null;
  const principal = deskAccess?.principal || null;

  const patch = (change) => {
    const next = saveSettings(change);
    setSettings(next);
    onSettingsChange?.(next, change);
  };

  const saveEmail = () => {
    const email = saveUserEmail(emailDraft);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(email ? `Research profile loaded for ${email}` : "Research profile cleared");
  };

  const bindPilot = () => {
    setEmailDraft(PILOT_PREVIEW_EMAIL);
    const email = saveUserEmail(PILOT_PREVIEW_EMAIL);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(`Loaded example research profile ${email}`);
  };

  const connectSession = async () => {
    setBusy(true);
    try {
      const out = await ensureDeskSession({ force: true });
      onToast?.(out.ok ? "Research desk connected for this browser" : out.error || "Desk connection failed");
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => {
    const saved = saveDeskToken(tokenDraft);
    setTokenDraft("");
    onToast?.(saved ? "Fallback access saved for this browser session" : "Fallback access cleared");
    onProfileRefresh?.();
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      clearDeskToken();
      await clearDeskSession();
      onToast?.("Research desk disconnected");
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      className="rd-v2-settings-page rd-v2-settings-workspace-page rd-v2-settings-modern"
      title="Settings"
      lead="Preferences, personalization, connections, and account controls for Research Drive."
      surfaceState={SETTINGS_SURFACE_STATE}
    >
      <div className="rd-v2-settings-modern-layout">
        <nav className="rd-v2-settings-local-nav" aria-label="Settings sections">
          <a href="#settings-general" className="is-active">General</a>
          <a href="#settings-personalization">Personalization</a>
          <a href="#settings-connections">Connections</a>
          <a href="#settings-advanced">Advanced</a>
        </nav>

        <div className="rd-v2-settings-modern-content">
          <SettingsSection
            id="settings-general"
            title="General"
            description="Default behavior for the Research Drive workspace."
          >
            <SettingsRow
              title="When Research Drive opens"
              description="Start from Home or continue from the last research surface you were using."
            >
              <select
                id="rd-settings-startup"
                value={settings.startup}
                onChange={(event) => patch({ startup: event.target.value })}
                className="rd-v2-select"
                aria-label="When Research Drive opens"
              >
                <option value="home">Home</option>
                <option value="resume">Continue where I left off</option>
              </select>
            </SettingsRow>

            <SettingsRow
              title="When evidence is selected"
              description="Choose the default Inspector view for ordinary Library and Discover selection."
            >
              <select
                id="rd-settings-on-select"
                value={settings.onSelect}
                onChange={(event) => patch({ onSelect: event.target.value })}
                className="rd-v2-select"
                aria-label="When evidence is selected"
              >
                <option value="detail">Show Detail</option>
                <option value="ask">Open Ask</option>
                <option value="keep">Keep current mode</option>
              </select>
            </SettingsRow>

            <SettingsRow
              title="Discover search"
              description="Choose whether Discover prefers known evidence first or searches wider immediately."
            >
              <select
                id="rd-settings-discover-scope"
                value={settings.discoverScope}
                onChange={(event) => patch({ discoverScope: event.target.value })}
                className="rd-v2-select"
                aria-label="Discover search"
              >
                <option value="known">Known evidence first</option>
                <option value="wide">Search wider immediately</option>
              </select>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            id="settings-personalization"
            title="Personalization"
            description="Research context Research Drive can use when organizing and recommending work."
          >
            <SettingsRow
              title="Research profile"
              description="Load academic context by email. This is research context, not your Research Drive account identity."
            >
              <div className="rd-v2-settings-profile-control">
                <input
                  id="rd-settings-email"
                  type="email"
                  className="rd-v2-input"
                  placeholder="researcher@university.edu"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  onKeyDown={(event) => handleEnterToSubmit(event, saveEmail)}
                  aria-label="Research profile email"
                />
                <button type="button" className="rd-v2-btn sm primary" onClick={saveEmail}>Save</button>
              </div>
            </SettingsRow>

            <SettingsRow
              title="Profile context"
              description="Profile shows the explicit research context Research Drive has on record. Missing context remains missing rather than being inferred here."
            >
              <span className="rd-v2-settings-status-text">{settings.email ? "Profile loaded" : "Not configured"}</span>
            </SettingsRow>

            {demoMode ? (
              <SettingsRow
                title="Example profile"
                description="Load the bundled example record for visual or demo verification."
              >
                <button type="button" className="rd-v2-btn sm ghost" onClick={bindPilot}>Use example</button>
              </SettingsRow>
            ) : null}
          </SettingsSection>

          <SettingsSection
            id="settings-connections"
            title="Connections"
            description="Browser access and external accounts connected to this workspace."
          >
            <SettingsRow
              title="Browser session"
              description={`${access.detail}. ${principal?.email ? `Signed in as ${principal.email}.` : "No named account identity is available in this browser."}`}
            >
              <div className="rd-v2-settings-session-actions">
                <span className={`rd-v2-settings-connection-state ${access.ok ? "is-ready" : "is-warning"}`}>{access.label}</span>
                {access.ok ? (
                  <>
                    <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={connectSession}>Reconnect</button>
                    <button type="button" className="rd-v2-btn sm danger" disabled={busy} onClick={disconnect}>Disconnect</button>
                  </>
                ) : (
                  <button type="button" className="rd-v2-btn sm primary" disabled={busy} onClick={connectSession}>Connect</button>
                )}
              </div>
            </SettingsRow>

            <div className="rd-v2-settings-connected-accounts">
              <ConnectedAccountsSection deskAccess={deskAccess} onToast={onToast} />
            </div>
          </SettingsSection>

          <section id="settings-advanced" className="rd-v2-settings-simple-section rd-v2-settings-advanced-section">
            <header>
              <h2>Advanced</h2>
              <p>Runtime status and fallback access for troubleshooting.</p>
            </header>
            <details className="rd-v2-settings-technical rd-v2-settings-technical-modern">
              <summary>
                <span>
                  <strong>System status & technical details</strong>
                  <small>Research API, assistant runtime, archive, equipment, and fallback access</small>
                </span>
                <em>Show</em>
              </summary>
              <div className="rd-v2-settings-technical-body">
                <StatementRow
                  label="Research API"
                  metric={health == null ? "Not checked" : health?.status || "Reported"}
                  sublabel="Catalog, Ask, jobs, query, and research-workspace service"
                  detail={health?.status === "ok" ? "OK" : health == null ? "UNKNOWN" : "CHECK"}
                  warn={health != null && health?.status !== "ok"}
                />
                <StatementRow
                  label="Assistant runtime"
                  metric={assistant.label}
                  sublabel={assistant.detail}
                  detail={assistant.ready ? "READY" : assistant.known ? "CHECK" : "UNKNOWN"}
                  warn={assistant.known && !assistant.ready}
                />
                <StatementRow
                  label="Research archive"
                  metric={archive.label}
                  sublabel={archive.detail}
                  detail={archive.ready ? "READY" : archive.known ? "CHECK" : "UNKNOWN"}
                  warn={archive.known && !archive.ready}
                />
                <StatementRow
                  label="Desk equipment"
                  metric={mcpTools != null ? `${mcpTools} MCP tools` : "Not reported"}
                  sublabel="Capability inventory belongs to Resources; this is only a compact status read"
                  detail={mcpTools != null ? "REPORTED" : "UNKNOWN"}
                />

                <div className="rd-v2-settings-fallback">
                  <div>
                    <strong>Fallback browser access</strong>
                    <p>Use only when this browser cannot mint the normal desk session.</p>
                  </div>
                  <div className="rd-v2-settings-inline-control">
                    <input
                      id="rd-settings-token"
                      type="password"
                      className="rd-v2-input"
                      placeholder="Fallback access token"
                      value={tokenDraft}
                      autoComplete="off"
                      onChange={(event) => setTokenDraft(event.target.value)}
                      onKeyDown={(event) => {
                        handleEnterToSubmit(event, () => {
                          if (!busy && tokenDraft.trim()) saveToken();
                        });
                      }}
                    />
                    <button type="button" className="rd-v2-btn sm" disabled={busy || !tokenDraft.trim()} onClick={saveToken}>
                      Save fallback
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
