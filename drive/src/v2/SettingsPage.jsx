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

function startupLabel(value) {
  return value === "resume" ? "Resume research" : "Home first";
}

function selectionLabel(value) {
  if (value === "ask") return "Ask";
  if (value === "keep") return "Keep mode";
  return "Detail";
}

function scopeLabel(value) {
  return value === "wide" ? "Wide search" : "Known first";
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
  const mcpTools =
    resourcesRollup?.ai?.mcp_tools?.total ?? resourcesRollup?.hero?.mcp_tools ?? null;
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
    onToast?.(email ? `Research profile loaded for ${email}` : "Research profile email cleared");
  };

  const bindPilot = () => {
    setEmailDraft(PILOT_PREVIEW_EMAIL);
    const email = saveUserEmail(PILOT_PREVIEW_EMAIL);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(`Bound example identity ${email}`);
  };

  const connectSession = async () => {
    setBusy(true);
    try {
      const out = await ensureDeskSession({ force: true });
      onToast?.(
        out.ok
          ? "Research desk connected for this browser"
          : out.error || "Desk connection failed",
      );
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => {
    const saved = saveDeskToken(tokenDraft);
    setTokenDraft("");
    onToast?.(
      saved
        ? "Fallback access saved for this browser session"
        : "Fallback access cleared",
    );
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
      className="rd-v2-settings-page rd-v2-settings-workspace-page"
      title="Settings"
      lead="Set the defaults, identity, and connections that shape this Research Drive workspace."
      surfaceState={SETTINGS_SURFACE_STATE}
    >
      <div className="rd-v2-settings-workspace">
        <section className="rd-v2-settings-policy-hero" aria-labelledby="rd-settings-policy-title">
          <div className="rd-v2-settings-policy-copy">
            <span>Workspace policy</span>
            <h2 id="rd-settings-policy-title">Your desk, by default</h2>
            <p>
              These choices control how Research Drive opens, how evidence selection behaves,
              and how aggressively Discover searches beyond what you already hold.
            </p>
          </div>
          <div className="rd-v2-settings-policy-summary" aria-label="Current workspace policy">
            <div>
              <span>Open</span>
              <strong>{startupLabel(settings.startup)}</strong>
            </div>
            <div>
              <span>Selection</span>
              <strong>{selectionLabel(settings.onSelect)}</strong>
            </div>
            <div>
              <span>Discover</span>
              <strong>{scopeLabel(settings.discoverScope)}</strong>
            </div>
          </div>
        </section>

        <div className="rd-v2-settings-layout">
          <section className="rd-v2-settings-panel rd-v2-settings-behavior" aria-labelledby="rd-settings-behavior-title">
            <header className="rd-v2-settings-panel-head">
              <div>
                <span>Behavior</span>
                <h2 id="rd-settings-behavior-title">How the desk responds</h2>
              </div>
              <p>Three defaults. Everything task-specific keeps its own authority.</p>
            </header>

            <div className="rd-v2-settings-policy-row">
              <div>
                <strong>When Research Drive opens</strong>
                <p>Start from Home, or resume the last research surface you were using.</p>
              </div>
              <select
                id="rd-settings-startup"
                value={settings.startup}
                onChange={(event) => patch({ startup: event.target.value })}
                className="rd-v2-select"
                aria-label="When Research Drive opens"
              >
                <option value="home">Home — show what needs attention</option>
                <option value="resume">Continue where I left off</option>
              </select>
            </div>

            <div className="rd-v2-settings-policy-row">
              <div>
                <strong>When evidence is selected</strong>
                <p>Choose the Inspector posture for ordinary Library and Discover selection.</p>
              </div>
              <select
                id="rd-settings-on-select"
                value={settings.onSelect}
                onChange={(event) => patch({ onSelect: event.target.value })}
                className="rd-v2-select"
                aria-label="When evidence is selected"
              >
                <option value="detail">Show Detail</option>
                <option value="ask">Open Ask</option>
                <option value="keep">Keep current Inspector mode</option>
              </select>
            </div>

            <div className="rd-v2-settings-policy-row">
              <div>
                <strong>Discover search</strong>
                <p>Prefer held and declared evidence first, or federate outward immediately.</p>
              </div>
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
            </div>

            <p className="rd-v2-settings-policy-note">
              Synthesis evidence-gap handoffs always begin known-first. Approval and operational
              decision states keep their own Inspector behavior regardless of these defaults.
            </p>
          </section>

          <aside className="rd-v2-settings-side-stack" aria-label="Identity and browser connection">
            <section className="rd-v2-settings-panel rd-v2-settings-identity-panel">
              <header className="rd-v2-settings-panel-head compact">
                <div>
                  <span>Research identity</span>
                  <h2>Who this desk researches for</h2>
                </div>
              </header>
              <p className="rd-v2-settings-panel-copy">
                A faculty record personalizes Profile and research context. It stays separate from your Research Drive account.
              </p>
              <label className="rd-v2-settings-field-label" htmlFor="rd-settings-email">Faculty email</label>
              <div className="rd-v2-settings-inline-control">
                <input
                  id="rd-settings-email"
                  type="email"
                  className="rd-v2-input"
                  placeholder="faculty@yzu.edu.tw"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  onKeyDown={(event) => handleEnterToSubmit(event, saveEmail)}
                />
                <button type="button" className="rd-v2-btn sm primary" onClick={saveEmail}>Save</button>
              </div>
              <div className="rd-v2-settings-identity-foot">
                <span>{settings.email ? "Profile bound" : "No profile bound"}</span>
                {demoMode ? (
                  <button type="button" className="rd-v2-settings-text-action" onClick={bindPilot}>
                    Use example record
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rd-v2-settings-panel rd-v2-settings-session-panel">
              <header className="rd-v2-settings-panel-head compact">
                <div>
                  <span>Browser session</span>
                  <h2>{access.label}</h2>
                </div>
                <em className={access.ok ? "ok" : "warn"}>{access.ok ? "Ready" : "Action needed"}</em>
              </header>
              <p className="rd-v2-settings-panel-copy">
                {access.detail}. {principal?.email ? `Signed in as ${principal.email}.` : "This browser has no named account identity."}
              </p>
              <div className="rd-v2-settings-action-row">
                {access.ok ? (
                  <>
                    <button type="button" className="rd-v2-btn sm ghost" disabled={busy} onClick={connectSession}>Reconnect</button>
                    <button type="button" className="rd-v2-btn sm danger" disabled={busy} onClick={disconnect}>Disconnect</button>
                  </>
                ) : (
                  <button type="button" className="rd-v2-btn sm primary" disabled={busy} onClick={connectSession}>Connect browser</button>
                )}
              </div>
            </section>
          </aside>
        </div>

        <section className="rd-v2-settings-panel rd-v2-settings-account-storage" aria-labelledby="rd-settings-account-storage-title">
          <header className="rd-v2-settings-panel-head wide">
            <div>
              <span>Account & storage</span>
              <h2 id="rd-settings-account-storage-title">Private workspace authority</h2>
            </div>
            <p>Account ownership and external storage connections live here, separate from faculty identity.</p>
          </header>
          <div className="rd-v2-settings-account-stack">
            <ConnectedAccountsSection deskAccess={deskAccess} onToast={onToast} />
          </div>
        </section>

        <details className="rd-v2-settings-technical">
          <summary>
            <span>
              <strong>System status & technical details</strong>
              <small>Runtime health, equipment, archive, and fallback browser access</small>
            </span>
            <em>Advanced</em>
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
      </div>
    </PageShell>
  );
}
