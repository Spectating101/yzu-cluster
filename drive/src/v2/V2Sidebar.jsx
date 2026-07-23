import { useEffect, useRef } from "react";
import { V2_SIDEBAR_TABS } from "@/v2/nav-config.jsx";

export function V2Sidebar({ tab, onTabChange }) {
  const activeButtonRef = useRef(null);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  return (
    <aside className="yzu-sidebar">
      <nav>
        {V2_SIDEBAR_TABS.map(({ id, label, Icon }) => (
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
        ))}
      </nav>
      <div className="rd-convergence-sidebar-context">
        <a
          href="/?tab=profile"
          className={tab === "profile" || tab === "settings" ? "active" : ""}
          aria-label="Open research context"
        >
          <span className="rd-convergence-context-avatar">YZ</span>
          <span className="rd-convergence-context-copy">
            <strong>Research context</strong>
            <small>Institutional workspace</small>
          </span>
          <span className="rd-convergence-context-chevron" aria-hidden>⌄</span>
        </a>
      </div>
    </aside>
  );
}