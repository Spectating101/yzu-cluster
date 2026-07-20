import { useState } from "react";
import {
  clearDeskToken,
  deskSessionBootstrapped,
  hasDeskToken,
  saveDeskToken,
  saveUserEmail,
} from "@/v2/deskSession";
import { clearDeskSession, ensureDeskSession } from "@/v2/api";
import { loadSettings, saveSettings } from "@/v2/settingsStore";
import { PageShell, StatementRow, StatementSection } from "@/v2/ui";
import { V2_TABS } from "@/v2/nav-config.jsx";

function deskAccessStatus(health) {
  const desk = health?.desk || {};
  if (hasDeskToken()) return { ok: true, label: "Connected · pasted token" };
  if (deskSessionBootstrapped() || desk.desk_session_cookie) {
    return { ok: true, label: deskSessionBootstrapped() ? "Connected · browser session" : "Session available" };
  }
  if (desk.desk_token_required) return { ok: false, label: "Not connected" };
  return { ok: true, label: "Open desk" };
}

export function SettingsPage({ health, onProfileRefresh, onToast }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [emailDraft, setEmailDraft] = useState(() => settings.email || "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const desk = health?.desk || {};
  const access = deskAccessStatus(health);

  const patch = (p) => setSettings(saveSettings(p));

  const saveEmail = () => {
    const email = saveUserEmail(emailDraft);
    patch({ email });
    onProfileRefresh?.();
    onToast?.(email ? `Profile loaded for ${email}` : "Email cleared");
  };

  const connectSession = async () => {
    setBusy(true);
    try {
      const out = await ensureDeskSession({ force: true });
      if (out.ok) onToast?.("Desk browser session connected");
      else onToast?.(out.error || "Desk session bootstrap failed");
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => {
    const saved = saveDeskToken(tokenDraft);
    setTokenDraft("");
    onToast?.(saved ? "Desk access token saved for this browser session" : "Desk token cleared");
    onProfileRefresh?.();
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      clearDeskToken();
      await clearDeskSession();
      onToast?.("Desk access disconnected");
      onProfileRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Settings" lead="Account, credentials, and desk integrations">
      <div className="rd-v2-settings-statement">
        <StatementSection title="Account">
          <div className="rd-v2-settings-row stack">
            <input
              type="email"
              className="rd-v2-input"
              placeholder="faculty@yzu.edu.tw"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
            <button type="button" className="rd-v2-btn sm primary" onClick={saveEmail}>
              Save
            </button>
          </div>
          <p className="rd-v2-settings-hint">Used for profile-aware Discover ranking and procurement chat.</p>
        </StatementSection>

        <StatementSection title="Desk access">
          <StatementRow
            label="Browser desk"
            metric={access.label}
            sublabel={desk.desk_token_required ? "Write operations require desk authorization" : "No desk token configured"}
            detail={access.ok ? "OK" : "NEED"}
            warn={!access.ok}
          />
          <div className="rd-v2-settings-row stack">
            <button type="button" className="rd-v2-btn sm primary" disabled={busy} onClick={connectSession}>
              Connect browser session
            </button>
            <button type="button" className="rd-v2-btn sm" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
          <p className="rd-v2-settings-hint">
            Same-origin Tailscale entry creates an HttpOnly desk session automatically. Paste a token only when reconnecting outside that path.
          </p>
          <div className="rd-v2-settings-row stack">
            <input
              type="password"
              className="rd-v2-input"
              placeholder="Desk access token (optional fallback)"
              value={tokenDraft}
              autoComplete="off"
              onChange={(e) => setTokenDraft(e.target.value)}
            />
            <button type="button" className="rd-v2-btn sm" disabled={busy || !tokenDraft.trim()} onClick={saveToken}>
              Save token for this session
            </button>
          </div>
        </StatementSection>

        <StatementSection title="Desk brain">
          <StatementRow
            label="Ask / Composer"
            metric={desk.composer_configured ? "Ready" : "Not configured"}
            sublabel={desk.brain || desk.composer_model || "cursor_composer"}
            detail={desk.composer_configured ? "OK" : "KEY"}
            warn={!desk.composer_configured}
          />
        </StatementSection>

        <StatementSection title="Credentials">
          <StatementRow label="BigQuery SA" metric="Configured" sublabel="Service account" detail="OK" />
          <StatementRow label="GDrive OAuth" metric={desk.gdrive?.ok === false ? "Needs review" : "Configured"} sublabel="Archive vault" detail={desk.gdrive?.ok === false ? "FAIL" : "OK"} warn={desk.gdrive?.ok === false} />
          <StatementRow label="DataCite token" metric="Optional" sublabel="DOI collection" detail="Add when needed" />
        </StatementSection>

        <StatementSection title="Display">
          <div className="rd-v2-settings-row">
            <span>Default tab</span>
            <select
              value={settings.defaultTab}
              onChange={(e) => patch({ defaultTab: e.target.value })}
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
            <span>On select</span>
            <select
              value={settings.onSelect}
              onChange={(e) => patch({ onSelect: e.target.value })}
              className="rd-v2-select"
            >
              <option value="detail">Detail</option>
              <option value="ask">Ask</option>
            </select>
          </div>
        </StatementSection>

        <StatementSection title="Integration">
          <StatementRow label="Query engine" metric=":8765" sublabel="Research API" detail="Open /api/health" onClick={() => window.open("/api/health", "_blank")} />
          <StatementRow label="Vite desk" metric=":5178" sublabel="Frontend" detail="Open app" onClick={() => window.open(window.location.origin, "_blank")} />
          <StatementRow label="Admin" metric="Workers / Jobs" sublabel="Operations" detail="Vault tools" />
        </StatementSection>
      </div>
    </PageShell>
  );
}
