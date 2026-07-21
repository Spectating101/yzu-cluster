import { useEffect, useMemo, useState } from "react";
import { deskHealth, facultyProfile } from "@/v2/api";
import {
  clearDeskToken,
  hasDeskToken,
  saveDeskToken,
  saveUserEmail,
} from "@/v2/deskSession";
import { loadSettings, saveSettings } from "@/v2/settingsStore";
import {
  SETTINGS_GROUP_LABELS,
  buildSettingsRailState,
  settingsAdvancedDefaultOpen,
} from "@/v2/settingsPresentation";
import { PageShell, StatementRow, StatementSection } from "@/v2/ui";
import { V2_TABS } from "@/v2/nav-config.jsx";
import {
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
} from "@/v2/RailFrame";

export const SETTINGS_GROUPS = [
  { id: "identity", title: "Identity" },
  { id: "access", title: "Access" },
  { id: "defaults", title: "Defaults" },
  { id: "advanced", title: "Advanced recovery" },
];

function healthSignalsPresent(desk) {
  return Boolean(
    desk &&
      ("composer_configured" in desk ||
        desk.mcp_tools?.total != null ||
        "gdrive" in desk ||
        "jobs" in desk),
  );
}

function assistantLabel(desk, healthLoaded) {
  if (!healthLoaded) return { label: "Not reported", known: false, ready: false, detail: "No /health desk payload" };
  if (desk.composer_configured === true) {
    return {
      label: "Ready",
      known: true,
      ready: true,
      detail: desk.composer_model || desk.brain || "Composer runtime",
    };
  }
  if (desk.composer_configured === false) {
    return {
      label: "Needs setup",
      known: true,
      ready: false,
      detail: "Assistant health reports offline",
    };
  }
  return { label: "Not reported", known: false, ready: false, detail: "No composer flag on /health" };
}

function archiveLabel(desk, healthLoaded) {
  if (!healthLoaded || !desk.gdrive) {
    return { label: "Not reported", known: false, ok: null, detail: "No archive signal on /health" };
  }
  if (desk.gdrive.ok === true || desk.gdrive.ready === true || desk.gdrive.drive_list_ok === true) {
    return {
      label: "Connected",
      known: true,
      ok: true,
      detail: desk.gdrive.drive_root || desk.gdrive.gdrive_remote || "GDrive probe ok",
    };
  }
  if (desk.gdrive.ok === false) {
    return { label: "Needs review", known: true, ok: false, detail: "Archive probe failed" };
  }
  return { label: "Not reported", known: true, ok: null, detail: "Archive signal incomplete" };
}

/**
 * Settings centre — Identity → Access → Defaults → Advanced recovery (collapsed).
 * No section Detail links. Identity save is browser-local research context only.
 */
export function SettingsPage({
  health,
  profile = null,
  onProfileRefresh,
  onToast,
  activeGroup,
  selectedGroup,
  onSelectGroup,
  onActiveGroupChange,
}) {
  const groupId = activeGroup || selectedGroup || "identity";
  const selectGroup = (id) => {
    onSelectGroup?.(id);
    onActiveGroupChange?.(id);
  };
  const [settings, setSettings] = useState(() => loadSettings());
  const [emailDraft, setEmailDraft] = useState(() => settings.email || "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenPresent, setTokenPresent] = useState(() => hasDeskToken());
  const [liveHealth, setLiveHealth] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(() => settingsAdvancedDefaultOpen());
  const [bindStatus, setBindStatus] = useState(null);
  const [savingIdentity, setSavingIdentity] = useState(false);

  const effectiveHealth = liveHealth || health;
  const desk = effectiveHealth?.desk || {};
  const healthLoaded = healthSignalsPresent(desk);
  const assistant = assistantLabel(desk, healthLoaded);
  const archive = archiveLabel(desk, healthLoaded);
  const deskPort =
    typeof window !== "undefined" ? `:${window.location.port || "8765"}` : ":8765";
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "—";

  const patch = (p) => setSettings(saveSettings(p));

  useEffect(() => {
    let cancelled = false;
    let liveApplied = false;
    deskHealth(false)
      .then((out) => {
        if (!cancelled && !liveApplied) setLiveHealth(out);
      })
      .catch(() => {});
    deskHealth(true)
      .then((live) => {
        liveApplied = true;
        if (!cancelled) setLiveHealth(live);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (groupId === "advanced") setAdvancedOpen(true);
  }, [groupId]);

  useEffect(() => {
    if (!settings.email) {
      setBindStatus(null);
      return;
    }
    if (profile && !profile.unknown && (profile.name_en || profile.name)) {
      setBindStatus({
        ok: true,
        name: profile.name_en || profile.name,
      });
    } else if (profile?.unknown && profile?.email) {
      setBindStatus({ ok: false, email: profile.email });
    }
  }, [profile, settings.email]);

  const saveEmail = async () => {
    const email = saveUserEmail(emailDraft);
    patch({ email });
    selectGroup("identity");
    setSavingIdentity(true);
    setBindStatus(null);

    try {
      if (!email) {
        onProfileRefresh?.();
        setBindStatus(null);
        onToast?.("Research context cleared on this browser");
        return;
      }

      const data = await facultyProfile(email);
      onProfileRefresh?.();
      if (data?.found && data.profile) {
        const name = data.profile.name_en || data.profile.name || "";
        setBindStatus({ ok: true, name: name || email });
        onToast?.(
          name
            ? `Context bound to ${name} on this browser`
            : `Context bound for ${email} on this browser`,
        );
      } else {
        setBindStatus({ ok: false, email });
        onToast?.(`No faculty profile resolved for ${email}`);
      }
    } catch {
      onProfileRefresh?.();
      setBindStatus({ ok: false, email });
      onToast?.(`Could not resolve faculty profile for ${email}`);
    } finally {
      setSavingIdentity(false);
    }
  };

  const saveToken = () => {
    const saved = saveDeskToken(tokenDraft);
    setTokenPresent(Boolean(saved));
    setTokenDraft("");
    onToast?.(saved ? "Fallback token saved for this browser session" : "Fallback token cleared");
    selectGroup("advanced");
  };

  const clearToken = () => {
    clearDeskToken();
    setTokenPresent(false);
    setTokenDraft("");
    onToast?.("Fallback token cleared");
    selectGroup("advanced");
  };

  return (
    <PageShell
      className="rd-v2-settings-page"
      title="Settings"
      lead="Identity, access, defaults, and recovery"
    >
      <div className="rd-v2-settings-statement" data-testid="settings-centre">
        <StatementSection
          title="Identity"
          className={groupId === "identity" ? "is-active-group" : ""}
        >
          <div
            className="rd-v2-settings-group"
            data-testid="settings-group-identity"
            onFocus={() => selectGroup("identity")}
          >
            <div className="rd-v2-settings-row stack">
              <label className="rd-v2-settings-label" htmlFor="settings-email">
                Faculty email
              </label>
              <input
                id="settings-email"
                type="email"
                className="rd-v2-input"
                placeholder="name@yzu.edu.tw"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onFocus={() => selectGroup("identity")}
                autoComplete="email"
              />
              <button
                type="button"
                className="rd-v2-btn sm primary"
                data-testid="settings-save-identity"
                disabled={savingIdentity}
                onClick={saveEmail}
              >
                {savingIdentity ? "Saving…" : "Save research context"}
              </button>
            </div>
            {bindStatus?.ok ? (
              <p className="rd-v2-settings-bind-ok" data-testid="settings-bind-status">
                Context bound to {bindStatus.name} on this browser. This is not sign-in or access
                control — it only shapes Discover ranking and Ask on this browser.
              </p>
            ) : null}
            {bindStatus && !bindStatus.ok ? (
              <p className="rd-v2-settings-bind-fail" data-testid="settings-bind-status">
                No faculty profile resolved for {bindStatus.email}. The email is saved on this
                browser only; ranking stays on generic defaults until a known profile resolves.
              </p>
            ) : null}
            {!bindStatus ? (
              <p className="rd-v2-settings-hint">
                Saves a browser-local research-context email. Not sign-in or access control.
              </p>
            ) : null}
          </div>
        </StatementSection>

        <StatementSection
          title="Access"
          className={groupId === "access" ? "is-active-group" : ""}
        >
          <div
            className="rd-v2-settings-group"
            data-testid="settings-group-access"
            onClick={() => selectGroup("access")}
          >
            <StatementRow
              label="Ask / Composer"
              metric={assistant.label}
              sublabel={assistant.detail}
              detail={assistant.ready ? "OK" : assistant.known ? "CHECK" : "UNKNOWN"}
              warn={assistant.known && !assistant.ready}
            />
            <StatementRow
              label="Research archive"
              metric={archive.label}
              sublabel={archive.detail}
              detail={archive.ok === true ? "OK" : archive.ok === false ? "CHECK" : "UNKNOWN"}
              warn={archive.ok === false}
            />
            {!healthLoaded ? (
              <p className="rd-v2-settings-hint">
                Desk health not loaded — Access stays Not reported until /health verifies.
              </p>
            ) : null}
          </div>
        </StatementSection>

        <StatementSection
          title="Defaults"
          className={groupId === "defaults" ? "is-active-group" : ""}
        >
          <div
            className="rd-v2-settings-group"
            data-testid="settings-group-defaults"
            onFocus={() => selectGroup("defaults")}
          >
            <div className="rd-v2-settings-row">
              <label htmlFor="settings-default-tab">Default tab</label>
              <select
                id="settings-default-tab"
                value={settings.defaultTab}
                onChange={(e) => {
                  patch({ defaultTab: e.target.value });
                  selectGroup("defaults");
                }}
                onFocus={() => selectGroup("defaults")}
                className="rd-v2-select"
              >
                {V2_TABS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rd-v2-settings-row">
              <label htmlFor="settings-on-select">On select</label>
              <select
                id="settings-on-select"
                value={settings.onSelect}
                onChange={(e) => {
                  patch({ onSelect: e.target.value });
                  selectGroup("defaults");
                }}
                onFocus={() => selectGroup("defaults")}
                className="rd-v2-select"
              >
                <option value="detail">Show Detail</option>
                <option value="ask">Open Ask</option>
              </select>
            </div>
          </div>
        </StatementSection>

        <details
          className={`rd-v2-settings-advanced${groupId === "advanced" ? " is-active-group" : ""}`}
          data-testid="settings-group-advanced"
          open={advancedOpen}
          onToggle={(e) => {
            const next = e.currentTarget.open;
            setAdvancedOpen(next);
            if (next) selectGroup("advanced");
          }}
        >
          <summary>Advanced recovery</summary>
          <div className="rd-v2-settings-advanced-body" data-testid="settings-advanced-body">
            <p className="rd-v2-settings-hint">
              Technical browser, bootstrap, and fallback-token diagnostics. Not faculty workflow.
            </p>
            <div className="rd-v2-settings-row">
              <span>Browser origin</span>
              <code>{browserOrigin}</code>
            </div>
            <div className="rd-v2-settings-row">
              <span>Vite desk port</span>
              <code>{deskPort}</code>
            </div>
            <div className="rd-v2-settings-row">
              <span>Bootstrap health</span>
              <code>{healthLoaded ? "desk health received" : "not received"}</code>
            </div>
            <div className="rd-v2-settings-row">
              <span>Fallback token</span>
              <code>{tokenPresent ? "present in sessionStorage" : "absent"}</code>
            </div>
            <div className="rd-v2-settings-row stack">
              <label className="rd-v2-settings-label" htmlFor="settings-fallback-token">
                Fallback access token
              </label>
              <input
                id="settings-fallback-token"
                type="password"
                className="rd-v2-input"
                placeholder="Only if same-origin session fails"
                value={tokenDraft}
                autoComplete="off"
                onChange={(e) => setTokenDraft(e.target.value)}
                onFocus={() => selectGroup("advanced")}
              />
              <div className="rd-v2-settings-actions">
                <button type="button" className="rd-v2-btn sm primary" onClick={saveToken}>
                  Save fallback
                </button>
                <button type="button" className="rd-v2-btn sm" onClick={clearToken}>
                  Clear
                </button>
                <button
                  type="button"
                  className="rd-v2-btn sm"
                  onClick={() => window.open("/api/health", "_blank")}
                >
                  Open /api/health
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

/** DETAIL rail — active group label + 2–4 facts. No Judgement, no Focus CTA. */
export function SettingsDetailPanel({
  health = null,
  settings: settingsProp = null,
  profile = null,
  activeGroup = "identity",
  group: groupProp = null,
}) {
  const settings = settingsProp || loadSettings();
  const groupId = groupProp || activeGroup || "identity";
  const group = SETTINGS_GROUPS.find((g) => g.id === groupId) || SETTINGS_GROUPS[0];

  const rail = useMemo(
    () =>
      buildSettingsRailState({
        group: group.id,
        settings,
        health,
        profile,
        tokenPresent: hasDeskToken(),
      }),
    [group.id, settings, health, profile],
  );

  const title = SETTINGS_GROUP_LABELS[group.id] || group.title;

  return (
    <RailFrame>
      <RailEntityHeader id={`settings-${group.id}`} title={title} />
      <div className="rd-v2-rail-scroll" data-testid="settings-detail-rail">
        <p className="rd-v2-rail-section-label">Facts</p>
        <RailFieldGrid>
          {rail.facts.map(([label, value]) => (
            <RailField key={label} label={label} value={value} />
          ))}
        </RailFieldGrid>
      </div>
    </RailFrame>
  );
}
