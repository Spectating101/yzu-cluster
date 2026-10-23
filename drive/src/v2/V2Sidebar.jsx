import { useEffect, useRef } from "react";
import { V2_SIDEBAR_FOOT_TABS, V2_SIDEBAR_PRIMARY_TABS } from "@/v2/nav-config.jsx";

/**
 * Left nav — docs/RESEARCH_DRIVE_UI.md §4:
 * RESEARCH DRIVE nav · ACTIVE RESEARCH · RECENT · Profile/Settings (foot)
 */
export function V2Sidebar({
  tab,
  onTabChange,
  activeResearch = null,
  canViewOperations = true,
  canUseAsk = true,
  showResearchContext = true,
  recentItems = [],
  onOpenRecent,
}) {
  const activeButtonRef = useRef(null);
  const research = activeResearch || {
    title: "No research focus set",
    emphases: [],
  };
  const recent = Array.isArray(recentItems) ? recentItems.slice(0, 4) : [];

  useEffect(() => {
    const button = activeButtonRef.current;
    const scroller = button?.closest("nav") || button?.parentElement;
    if (!button || !scroller) return;
    const box = button.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (box.left >= view.left && box.right <= view.right && box.top >= view.top && box.bottom <= view.bottom) return;
    button.scrollIntoView({ block: "nearest", inline: "center" });
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
            role="region"
            aria-label="Synthesis work"
          />
        </>
      ) : (
        <>
          {showResearchContext && (research.emphases?.length || research.title !== "No research focus set") ? <div className="rd-v2-sidebar-context" role="group" aria-label="Active research">
            <p className="rd-v2-sidebar-kicker">Active research</p>
            <strong className="rd-v2-sidebar-research-title">{research.title}</strong>
            {research.emphases?.length ? (
              <ul className="rd-v2-sidebar-emphases">
                {research.emphases.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="rd-v2-sidebar-hint">Add your research focus in Profile.</p>
            )}
          </div> : null}

          {/* VC-8: with no real recent assets the block is removed rather than
              decorated with a placeholder line. */}
          {recent.length ? (
            <div className="rd-v2-sidebar-recent" role="group" aria-label="Recent">
              <p className="rd-v2-sidebar-kicker">Recent</p>
              <ul>
                {recent.map((item) => (
                  <li key={item.id}>
                    <button type="button" title={item.title} onClick={() => onOpenRecent?.(item)}>
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
