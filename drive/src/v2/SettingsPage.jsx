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
import { assistantRuntimeDetail, composerRuntimeRead } from "@/v2/composerRuntimeStatus";
import { loadSettings, saveSettings } from "@/v2/settingsStore";
import { PILOT_PREVIEW_EMAIL } from "@/v2/profileViewModel";
import { PageShell, StatementRow, StatementSection } from "@/v2/ui";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";

// Settings is immediately usable browser-local configuration. Runtime facts
// inside its optional technical disclosure may still be unmeasured, but they
// cannot make the settings surface itself a loading or fabricated empty state.
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
  const desk = health?.desk || {};
  const archive =
    desk?.gdrive?.ok === true
      ? "Connected"
      : desk?.gdrive?.ok === false
        ? "Needs review"
        : "Not reported";
  const mcpTools =
    resourcesRollup?.ai?.mcp_tools?.total ?? resourcesRollup?.hero?.mcp_tools ?? null;

  const patch = (change) => {
    const next = saveSettings(change);
    setSettings(next);
    onSettingsChange?.(next, change);
  };

  const saveEmail = () => {
    const email = saveUserEmail(emailDraft);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(
      email ? `Research profile loaded for ${email}` : "Research profile email cleared",
    );
  };

  const bindPilot = () => {
    setEmailDraft(PILOT_PREVIEW_EMAIL);
    const email = saveUserEmail(PILOT_PREVIEW_EMAIL);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(`Bound EXAMPLE identity ${email}`);
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
      className="rd-v2-settings-page"
      title="Settings"
      lead="Choose how Research Drive behaves for this browser. Operational health lives under system status, not in the preference hierarchy."
      surfaceState={SETTINGS_SURFACE_STATE}
    >
      <div className="rd-v2-settings-statement">
        <StatementSection title="Workspace behavior">
          <div className="rd-v2-settings-row">
            <label className="rd-v2-settings-label" htmlFor="rd-settings-startup">
              When Research Drive opens
            </label>
            <select
              id="rd-settings-startup"
              value={settings.startup}
              onChange={(event) => patch({ startup: event.target.value })}
              className="rd-v2-select"
            >
              <option value="home">Home — show what needs attention</option>
              <option value="resume">Continue where I left off</option>
            </select>
          </div>
          <p className="rd-v2-settings-hint">
            Continue remembers only Library, Discover, or Synthesis. Profile, Settings, and
            Resources never become a resume destination.
          </p>

          <div className="rd-v2-settings-row">
            <label className="rd-v2-settings-label" htmlFor="rd-settings-on-select">
              When evidence is selected
            </label>
            <select
              id="rd-settings-on-select"
              value={settings.onSelect}
              onChange={(event) => patch({ onSelect: event.target.value })}
              className="rd-v2-select"
            >
              <option value="detail">Show Detail</option>
              <option value="ask">Open Ask</option>
              <option value="keep">Keep current Inspector mode</option>
            </select>
          </div>
          <p className="rd-v2-settings-hint">
            Applies to evidence selection in Library and Discover. Approval, Resources, and
            Synthesis decision states keep their task-specific Inspector behavior.
          </p>

          <div className="rd-v2-settings-row">
            <label
              className="rd-v2-settings-label"
              htmlFor="rd-settings-discover-scope"
            >
              Discover search
            </label>
            <select
              id="rd-settings-discover-scope"
              value={settings.discoverScope}
              onChange={(event) => patch({ discoverScope: event.target.value })}
              className="rd-v2-select"
            >
              <option value="known">Known evidence first</option>
              <option value="wide">Search wider immediately</option>
            </select>
          </div>
          <p className="rd-v2-settings-hint">
            Known-first paints Library and declared routes before progressive enrichment. Wide
            starts semantic/live federation immediately. Synthesis evidence-gap handoffs always
            begin known-first.
          </p>
        </StatementSection>

        <ConnectedAccountsSection deskAccess={deskAccess} onToast={onToast} />

        <StatementSection title="Research identity">
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-settings-email">
              Faculty email
            </label>
            <input
              id="rd-settings-email"
              type="email"
              className="rd-v2-input"
              placeholder="faculty@yzu.edu.tw"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              aria-describedby="rd-settings-email-hint"
              onKeyDown={(event) => handleEnterToSubmit(event, saveEmail)}
            />
            <button type="button" className="rd-v2-btn sm primary" onClick={saveEmail}>
              Save identity
            </button>
            {demoMode ? (
              <button type="button" className="rd-v2-btn sm ghost" onClick={bindPilot}>
                Use EXAMPLE (Kong)
              </button>
            ) : null}
          </div>
          <p id="rd-settings-email-hint" className="rd-v2-settings-hint">
            Binds the faculty-registry record shown in Profile. This does not edit registry
            research facts.
          </p>
        </StatementSection>

        <StatementSection title="Desk connection">
          <StatementRow
            label="This browser"
            metric={access.label}
            sublabel={access.detail}
            detail={access.ok ? "OK" : "NEED"}
            warn={!access.ok}
          />
          <div className="rd-v2-settings-row stack">
            {access.ok ? (
              <>
                <button
                  type="button"
                  className="rd-v2-btn sm ghost"
                  disabled={busy}
                  onClick={connectSession}
                >
                  Reconnect
                </button>
                <button
                  type="button"
                  className="rd-v2-btn sm danger"
                  disabled={busy}
                  onClick={disconnect}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rd-v2-btn sm primary"
                disabled={busy}
                onClick={connectSession}
              >
                Connect browser
              </button>
            )}
          </div>
        </StatementSection>

        <details className="rd-v2-settings-advanced">
          <summary>System status and technical details</summary>
          <div className="rd-v2-settings-advanced-body">
            <StatementRow
              label="Research API"
              metric={health == null ? "Not checked" : health?.status || "Reported"}
              sublabel="Catalog, Ask, jobs, query, and research-workspace service"
              detail={
                health?.status === "ok"
                  ? "OK"
                  : health == null
                    ? "UNKNOWN"
                    : "CHECK"
              }
              warn={health != null && health?.status !== "ok"}
            />
            <StatementRow
              label="Assistant runtime"
              metric={assistant.label}
              sublabel={assistant.detail}
              detail={
                assistant.ready ? "READY" : assistant.known ? "CHECK" : "UNKNOWN"
              }
              warn={assistant.known && !assistant.ready}
            />
            <StatementRow
              label="Research archive"
              metric={archive}
              sublabel="Archive health reported by the desk"
              detail={
                desk?.gdrive?.ok === true
                  ? "OK"
                  : desk?.gdrive?.ok === false
                    ? "CHECK"
                    : "UNKNOWN"
              }
              warn={desk?.gdrive?.ok === false}
            />
            <StatementRow
              label="Desk equipment"
              metric={mcpTools != null ? `${mcpTools} MCP tools` : "Not reported"}
              sublabel="Capability inventory belongs to Resources; this is a compact status read"
              detail={mcpTools != null ? "REPORTED" : "UNKNOWN"}
            />

            <details className="rd-v2-settings-advanced">
              <summary>Fallback browser access</summary>
              <div className="rd-v2-settings-advanced-body">
                <p className="rd-v2-settings-hint">
                  Use only when this browser cannot mint the normal desk session.
                </p>
                <div className="rd-v2-settings-row stack">
                  <label className="rd-v2-settings-label" htmlFor="rd-settings-token">
                    Fallback access token
                  </label>
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
                  <button
                    type="button"
                    className="rd-v2-btn sm"
                    disabled={busy || !tokenDraft.trim()}
                    onClick={saveToken}
                  >
                    Save fallback
                  </button>
                </div>
              </div>
            </details>
          </div>
        </details>
      </div>
    </PageShell>
  );
}
