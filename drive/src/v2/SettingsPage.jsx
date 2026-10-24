import { useState } from "react";
import {
  clearDeskToken,
  deskSessionBootstrapped,
  hasDeskToken,
  saveUserEmail,
} from "@/v2/deskSession";
import { clearDeskSession, ensureDeskSession } from "@/v2/api";
import { ProviderConnectionsSection } from "@/v2/ProviderConnectionsSection";
import { AccountAdministration, AccountSection, AssistantAllowance } from "./AccountSection.jsx";
import { AssistantConnections } from "./AssistantConnections.jsx";
import { signInWithMemberAccessCode } from "./apiCore.js";
import { ConnectedAccountsSection } from "@/v2/ConnectedAccountsSection";
import { archiveRuntimeStatus } from "@/v2/archiveRuntimeStatus";
import { assistantRuntimeDetail, composerRuntimeRead } from "@/v2/composerRuntimeStatus";
import { loadSettings, saveSettings } from "@/v2/settingsStore";
import { PALETTES, THEMES, applyAppearance, loadAppearance, saveAppearance } from "@/v2/appearance";
import { PILOT_PREVIEW_EMAIL } from "@/v2/profileViewModel";
import { PageShell, StatementHeadingLevel, StatementRow, StatementSection } from "@/v2/ui";
import { handleEnterToSubmit } from "@/v2/enterToSubmit";

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
  onSignOut,
  onOpenAccess,
  onAccountChanged,
}) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [emailDraft, setEmailDraft] = useState(() => settings.email || "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const access = deskAccessStatus(health, deskAccess);
  const canViewFacultyProfile = Boolean(deskAccess?.permissions?.view_faculty_profile);
  const assistant = assistantStatus(health);
  const demoMode = isDemoMode();
  const desk = health?.desk || {};
  const archive = archiveRuntimeStatus(health);
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
    onToast?.(`Connected example account ${email}`);
  };

  const connectSession = async () => {
    setBusy(true);
    try {
      const out = await ensureDeskSession({ force: true });
      onToast?.(
        out.ok
          ? "Research Drive connected for this browser"
          : out.error || "Research Drive connection failed",
      );
      onProfileRefresh?.();
      onAccountChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const saveToken = async () => {
    setBusy(true);
    try {
      await signInWithMemberAccessCode(tokenDraft);
      setTokenDraft("");
      await onAccountChanged?.();
      onToast?.("Access code exchanged for a browser session.");
    } catch (error) { onToast?.(error.message, "error"); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (onSignOut) return onSignOut();
    setBusy(true);
    try {
      clearDeskToken();
      await clearDeskSession();
      onToast?.("Research Drive disconnected");
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const connectionSection = (
    <StatementSection title="Research Drive connection">
      <StatementRow
        label="This browser"
        metric={access.label}
        sublabel={access.detail}
        detail={access.ok ? "Healthy" : "Needed"}
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
  );

  return (
    <PageShell
      className="rd-v2-settings-page"
      title="Settings"
      lead="Your account, and how Research Drive behaves in this browser."
      surfaceState="ready"
    >
      <div className="rd-v2-settings-statement">
        <SettingsGroup id="account" title="Account">
          <AccountSection deskAccess={deskAccess} onSignOut={onSignOut} onOpenAccess={onOpenAccess} />
          {access.ok ? null : connectionSection}
        </SettingsGroup>

        <SettingsGroup id="preferences" title="Preferences">
          <AppearanceSection />
          <StatementSection title="Workspace behavior">
            <div className="rd-v2-settings-preference-grid">
              <div className="rd-v2-settings-preference">
                <div className="rd-v2-settings-row">
                  <label className="rd-v2-settings-label" htmlFor="rd-settings-startup">When Research Drive opens</label>
                  <select id="rd-settings-startup" value={settings.startup} onChange={(event) => patch({ startup: event.target.value })} className="rd-v2-select">
                    <option value="home">Home — show what needs attention</option>
                    <option value="resume">Continue where I left off</option>
                  </select>
                </div>
                <p className="rd-v2-settings-hint">Continue remembers only Library, Discover, or Synthesis—not administrative pages.</p>
              </div>
              <div className="rd-v2-settings-preference">
                <div className="rd-v2-settings-row">
                  <label className="rd-v2-settings-label" htmlFor="rd-settings-on-select">When evidence is selected</label>
                  <select id="rd-settings-on-select" value={settings.onSelect} onChange={(event) => patch({ onSelect: event.target.value })} className="rd-v2-select">
                    <option value="detail">Show Detail</option>
                    <option value="ask">Open Ask</option>
                    <option value="keep">Keep current Inspector mode</option>
                  </select>
                </div>
                <p className="rd-v2-settings-hint">Library and Discover follow this preference; decision states retain their task-specific view.</p>
              </div>
              <div className="rd-v2-settings-preference">
                <div className="rd-v2-settings-row">
                  <label className="rd-v2-settings-label" htmlFor="rd-settings-discover-scope">Discover search</label>
                  <select id="rd-settings-discover-scope" value={settings.discoverScope} onChange={(event) => patch({ discoverScope: event.target.value })} className="rd-v2-select">
                    <option value="known">Known evidence first</option>
                    <option value="wide">Search wider immediately</option>
                  </select>
                </div>
                <p className="rd-v2-settings-hint">Search starts with data in your Library. Wider search adds live sources and matches by meaning.</p>
              </div>
            </div>
          </StatementSection>
        </SettingsGroup>

        {deskAccess?.permissions?.use_ask ? (
          <SettingsGroup id="assistant" title="Assistant">
            <AssistantAllowance deskAccess={deskAccess} />
            <AssistantConnections key={deskAccess.principal?.id} onOpenAccess={onOpenAccess} />
          </SettingsGroup>
        ) : null}

        <SettingsGroup id="connections" title="Connections">
          <ConnectedAccountsSection deskAccess={deskAccess} onToast={onToast} showIdentity={false} />
          <ProviderConnectionsSection deskAccess={deskAccess} onToast={onToast} />
          <StatementSection title="Research identity">
            {canViewFacultyProfile ? (
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
                  Use example account (Kong)
                </button>
              ) : null}
            </div>
            ) : null}
            <p id="rd-settings-email-hint" className="rd-v2-settings-hint">
              {canViewFacultyProfile
                ? "Binds the faculty-registry record shown in Profile. This does not edit registry research facts."
                : "Public browsing does not load or bind a faculty identity. Sign in to save a research profile and research trail."}
            </p>
          </StatementSection>
        </SettingsGroup>

        {deskAccess?.principal?.role === "operator" ? (
          <SettingsGroup id="access" title="Researcher access">
            <AccountAdministration deskAccess={deskAccess} />
          </SettingsGroup>
        ) : null}

        <details className="rd-v2-settings-advanced rd-v2-settings-group-advanced" data-testid="settings-advanced">
          <summary>Advanced</summary>
          <div className="rd-v2-settings-advanced-body">
            <StatementHeadingLevel.Provider value={3}>
              {archive.known ? (
                <StatementSection title="Research Drive storage">
                  <StatementRow
                    label="Shared evidence archive"
                    metric={archive.label}
                    sublabel={archive.detail}
                    detail={archive.ready ? "Ready" : archive.known ? "Needs a check" : "Unknown"}
                    warn={archive.known && !archive.ready}
                  />
                  <p className="rd-v2-settings-hint">
                    This service-managed archive supplies the shared Library. Personal storage under Connections is optional and never replaces the default research estate.
                  </p>
                </StatementSection>
              ) : null}
              {access.ok ? connectionSection : null}
              <details className="rd-v2-settings-advanced">
                <summary>System status and technical details</summary>
                <div className="rd-v2-settings-advanced-body">
                  <StatementRow
                    label="Research API"
                    metric={health == null ? "Not checked" : health?.status || "Reported"}
                    sublabel="Catalog, Ask, jobs, query, and research-workspace service"
                    detail={
                      health?.status === "ok"
                        ? "Healthy"
                        : health == null
                          ? "Unknown"
                          : "Needs a check"
                    }
                    warn={health != null && health?.status !== "ok"}
                  />
                  <StatementRow
                    label="Assistant runtime"
                    metric={assistant.label}
                    sublabel={assistant.detail}
                    detail={
                      assistant.ready ? "Ready" : assistant.known ? "Needs a check" : "Unknown"
                    }
                    warn={assistant.known && !assistant.ready}
                  />
                  <StatementRow
                    label="Research archive"
                    metric={archive.label}
                    sublabel={archive.detail}
                    detail={archive.ready ? "Ready" : archive.known ? "Needs a check" : "Unknown"}
                    warn={archive.known && !archive.ready}
                  />
                  <StatementRow
                    label="Research tools"
                    metric={mcpTools != null ? `${mcpTools} research tools` : "Not reported"}
                    sublabel="Capability inventory belongs to Resources; this is a compact status read"
                    detail={mcpTools != null ? "Reported" : "Unknown"}
                  />

                  {deskAccess?.permissions?.view_operations ? <details className="rd-v2-settings-advanced">
                    <summary>Fallback browser access</summary>
                    <div className="rd-v2-settings-advanced-body">
                      <p className="rd-v2-settings-hint">
                        Exchange an issued access code for a browser session. The code is removed after sign-in.
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
                          Use access code
                        </button>
                      </div>
                    </div>
                  </details> : null}
                </div>
              </details>
            </StatementHeadingLevel.Provider>
          </div>
        </details>





      </div>
    </PageShell>
  );
}

function SettingsGroup({ id, title, children }) {
  return (
    <section className="rd-v2-settings-group" aria-labelledby={`settings-group-${id}`} data-testid={`settings-group-${id}`}>
      <h2 id={`settings-group-${id}`} className="rd-v2-settings-group-title">{title}</h2>
      <StatementHeadingLevel.Provider value={3}>{children}</StatementHeadingLevel.Provider>
    </section>
  );
}

function AppearanceSection() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const choose = (change) => {
    const next = saveAppearance(change);
    applyAppearance(next);
    setAppearance(next);
  };
  return (
    <StatementSection title="Appearance">
      <div className="rd-v2-settings-preference-grid">
        <div className="rd-v2-settings-preference">
          <div className="rd-v2-settings-row">
            <label className="rd-v2-settings-label" htmlFor="rd-settings-theme">Theme</label>
            <select id="rd-settings-theme" value={appearance.theme} onChange={(event) => choose({ theme: event.target.value })} className="rd-v2-select">
              {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="rd-v2-settings-preference">
          <div className="rd-v2-settings-row">
            <label className="rd-v2-settings-label" htmlFor="rd-settings-palette">Palette</label>
            <select id="rd-settings-palette" value={appearance.palette} onChange={(event) => choose({ palette: event.target.value })} className="rd-v2-select">
              {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <p className="rd-v2-settings-hint">Applies to this browser only.</p>
        </div>
      </div>
    </StatementSection>
  );
}
