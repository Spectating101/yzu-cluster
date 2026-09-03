import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { V2_SIDEBAR_FOOT_TABS, V2_SIDEBAR_PRIMARY_TABS } from "@/v2/nav-config.jsx";
import {
  SYNTHESIS_AUTOMATION_OPTIONS,
  synthesisAutomationOption,
  useSynthesisAutomationMode,
} from "@/v2/synthesisAutomation.js";

function SynthesisAuthorityPortal({ enabled, mode, setMode, option }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return undefined;
    }

    let frame = 0;
    const syncTarget = () => {
      const next = document.querySelector(".rd-v2-synthesis-page .s04-head > em");
      setTarget((current) => (current === next ? current : next));
    };
    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncTarget);
    };

    syncTarget();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      setTarget(null);
    };
  }, [enabled]);

  if (!enabled || !target) return null;
  return createPortal(
    <span
      className={`rd-v2-synthesis-page-authority is-${mode}`}
      data-testid="synthesis-authority-control"
      title={option.detail}
    >
      <span>AI authority</span>
      <select
        aria-label="Synthesis agent authority"
        data-testid="synthesis-automation-mode"
        value={mode}
        onChange={(event) => setMode(event.target.value)}
      >
        {SYNTHESIS_AUTOMATION_OPTIONS.map((automationOption) => (
          <option key={automationOption.id} value={automationOption.id}>{automationOption.short}</option>
        ))}
      </select>
    </span>,
    target,
  );
}

/**
 * Left nav — UI_PRODUCT_AUTHORITY + page freezes shell:
 * RESEARCH DRIVE nav · ACTIVE RESEARCH · RECENT · Profile/Settings (foot)
 */
export function V2Sidebar({
  tab,
  onTabChange,
  activeResearch = null,
  recentItems = [],
  onOpenRecent,
}) {
  const activeButtonRef = useRef(null);
  const [synthesisAutomationMode, setSynthesisAutomationMode] = useSynthesisAutomationMode();
  const automationOption = synthesisAutomationOption(synthesisAutomationMode);
  const research = activeResearch || {
    title: "Active research",
    emphases: [],
  };
  const recent = Array.isArray(recentItems) ? recentItems.slice(0, 4) : [];

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  function renderNavButton({ id, label, Icon }) {
    return (
      <button
        key={id}
        type="button"
        ref={tab === id ? activeButtonRef : null}
        className={tab === id ? "active" : ""}
        onClick={() => onTabChange(id)}
        title={label}
      >
        {Icon ? <Icon /> : null}
        <span className="rd-nav-label">{label}</span>
      </button>
    );
  }

  return (
    <aside className="yzu-sidebar rd-v2-sidebar-wire" aria-label="Research Drive navigation">
      <SynthesisAuthorityPortal
        enabled={tab === "synthesis"}
        mode={synthesisAutomationMode}
        setMode={setSynthesisAutomationMode}
        option={automationOption}
      />

      <nav className="rd-v2-sidebar-nav" aria-label="Faculty destinations">
        {V2_SIDEBAR_PRIMARY_TABS.map(renderNavButton)}
      </nav>

      {tab === "synthesis" ? (
        <>
          {/* S-04 owns this region: it is the approved ACTIVE WORK / REGISTERED
             OUTPUTS surface, not a second navigational column inside the page. */}
          <div
            id="rd-v2-synthesis-sidebar-slot"
            className="rd-v2-synthesis-sidebar-slot"
            aria-label="Synthesis work"
          />
        </>
      ) : (
        <>
          <div className="rd-v2-sidebar-context" aria-label="Active research">
            <p className="rd-v2-sidebar-kicker">Active research</p>
            <strong className="rd-v2-sidebar-research-title">{research.title}</strong>
            {research.emphases?.length ? (
              <ul className="rd-v2-sidebar-emphases">
                {research.emphases.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="rd-v2-sidebar-hint">Profile sets research direction.</p>
            )}
          </div>

          {/* VC-8: with no real recent assets the block is removed rather than
              decorated with a placeholder line. */}
          {recent.length ? (
            <div className="rd-v2-sidebar-recent" aria-label="Recent">
              <p className="rd-v2-sidebar-kicker">Recent</p>
              <ul>
                {recent.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onOpenRecent?.(item)}>
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <nav className="rd-v2-sidebar-foot-nav" aria-label="Account">
        {V2_SIDEBAR_FOOT_TABS.map(renderNavButton)}
      </nav>
    </aside>
  );
}
