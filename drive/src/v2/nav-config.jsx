/** Frozen v2 sidebar — see docs/design/V2_FORWARD_FROZEN.md */

import { SYNTHESIS_NAV_DEFERRED } from "@/v2/releaseVisibility.js";

/* Inline SVG icons — 16×16 at 1.5 stroke. No external deps. */
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const LibraryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
/** Synthesis tab — parked behind SYNTHESIS_NAV_DEFERRED (default false for showcase). */
export const V2_SYNTHESIS_TAB = { id: "synthesis", label: "Synthesis", Icon: SynthesisIcon };

/** Primary destinations — stay in the upper nav stack. */
export const V2_SIDEBAR_PRIMARY_TABS = [
  { id: "home",      label: "Home",      Icon: HomeIcon },
  { id: "library",   label: "Library",   Icon: LibraryIcon },
  { id: "browse",    label: "Discover",  Icon: BrowseIcon },
  ...(SYNTHESIS_NAV_DEFERRED ? [] : [V2_SYNTHESIS_TAB]),
  { id: "resources", label: "Resources", Icon: ResourcesIcon },
];

/** Account destinations — pinned to the bottom of the sidebar (still full pages). */
export const V2_SIDEBAR_FOOT_TABS = [
  { id: "profile",   label: "Profile",   Icon: ProfileIcon },
  { id: "settings",  label: "Settings",  Icon: SettingsIcon },
];

export const V2_SIDEBAR_TABS = [...V2_SIDEBAR_PRIMARY_TABS, ...V2_SIDEBAR_FOOT_TABS];

export { SYNTHESIS_NAV_DEFERRED };

/** All routable tabs. */
export const V2_TABS = V2_SIDEBAR_TABS;
