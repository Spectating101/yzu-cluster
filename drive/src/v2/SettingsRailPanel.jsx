import { useEffect, useState } from "react";
import { deskSessionBootstrapped, hasDeskToken } from "@/v2/deskSession";
import { loadSettings } from "@/v2/settingsStore";
import {
  RailDecisionSummary,
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function startupLabel(value) {
  return value === "resume" ? "Continue where I left off" : "Home";
}

function selectionLabel(value) {
  if (value === "ask") return "Open Ask";
  if (value === "keep") return "Keep current mode";
  return "Show Detail";
}

function discoverLabel(value) {
  return value === "wide" ? "Search wider immediately" : "Known evidence first";
}

function browserAccessLabel() {
  if (hasDeskToken()) return "Fallback browser access";
  if (deskSessionBootstrapped()) return "Browser session";
  return "Desk-managed session";
}

function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function SettingsRailPanel({ onAskAbout }) {
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => {
    let timer = null;
    const sync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSettings(loadSettings()), 0);
    };
    const events = ["change", "click", "keydown"];
    events.forEach((eventName) => document.addEventListener(eventName, sync));
    return () => {
      window.clearTimeout(timer);
      events.forEach((eventName) => document.removeEventListener(eventName, sync));
    };
  }, []);

  const profileEmail = String(settings.email || "").trim();
  const profileReady = Boolean(profileEmail);
  const behavior = [
    startupLabel(settings.startup),
    selectionLabel(settings.onSelect),
    discoverLabel(settings.discoverScope),
  ].join(" · ");

  return (
    <RailFrame>
      <RailEntityHeader
        id="settings"
        title="Workspace policy"
        description="Live read of how this browser and research desk are configured to behave."
        pills={<span className={`rd-v2-pill${profileReady ? "" : " warn"}`}>{profileReady ? "Context linked" : "Base policy"}</span>}
      />
      <RailDecisionSummary
        status={profileReady ? "Research context connected" : "Research context not configured"}
        primary={profileReady
          ? "Workspace behavior and an explicit research profile are available to the desk."
          : "Workspace behavior is configured, but Profile has no explicit researcher context yet."}
        risk={profileReady ? "Context remains source-bounded" : "Profile context unavailable"}
        next={profileReady ? "Review only when your research context changes" : "Connect a research profile in Personalization"}
      />
      <div className="rd-v2-rail-scroll rd-v2-settings-rail-scroll">
        <section className="rd-v2-settings-rail-module">
          <p className="rd-v2-rail-section-label">Current behavior</p>
          <RailFieldGrid>
            <RailField label="Startup" value={startupLabel(settings.startup)} />
            <RailField label="Evidence selection" value={selectionLabel(settings.onSelect)} />
            <RailField label="Discover" value={discoverLabel(settings.discoverScope)} />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-settings-rail-module">
          <p className="rd-v2-rail-section-label">Research context</p>
          <RailFieldGrid>
            <RailField label="Profile" value={profileReady ? profileEmail : "Not configured"} />
            <RailField label="Authority" value="Explicit profile context only" />
            <RailField label="Boundary" value="Research context is separate from account identity" />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-settings-rail-module">
          <p className="rd-v2-rail-section-label">Browser access</p>
          <RailFieldGrid>
            <RailField label="Session" value={browserAccessLabel()} />
            <RailField label="Fallback" value={hasDeskToken() ? "In use" : "Not in use"} />
          </RailFieldGrid>
          <p className="rd-v2-settings-rail-note">
            Technical runtime health stays collapsed in Advanced unless troubleshooting is actually needed.
          </p>
        </section>
      </div>
      <RailStickyFooter>
        <button
          type="button"
          className="rd-v2-btn sm primary"
          onClick={() => jumpTo("settings-personalization")}
        >
          {profileReady ? "Review personalization" : "Connect research profile"}
        </button>
        {onAskAbout ? (
          <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
            Ask setup help →
          </button>
        ) : null}
      </RailStickyFooter>
    </RailFrame>
  );
}
