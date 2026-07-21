/**
 * Profile centre + Detail rail presentation helpers.
 * Centre model is exactly Memory → Works → Lab.
 */

export const PROFILE_SECTION_ORDER = Object.freeze(["memory", "works", "lab"]);

export function isProfileBound(profile) {
  return Boolean(profile && !profile.unknown);
}

export function profileCentreMode(profile) {
  return isProfileBound(profile) ? "bound" : "unbound";
}

export function profilePrimaryCommand(mode) {
  if (mode === "unbound") {
    return { id: "connect-email", label: "Connect faculty email", tab: "settings" };
  }
  return null;
}

export function buildProfileRailState({
  profile = null,
  selectedWork = null,
  profileResolved = false,
} = {}) {
  const bound = isProfileBound(profile);

  if (!profileResolved && profile == null) {
    return {
      status: "unbound",
      identity: ["Desk unbound", "Faculty identity pending"],
      judgement: "Connect a faculty email in Settings to load Memory, Works, and Lab.",
      facts: ["Ranking uses generic desk defaults until a faculty email is saved on this browser."],
      unknowns: ["Faculty identity", "Research memory", "Lab links"],
      primaryAction: { id: "connect-email", label: "Connect faculty email", tab: "settings" },
      secondaryActions: [],
      loadingLabel: null,
    };
  }

  if (selectedWork?.title) {
    return {
      status: "work",
      identity: [selectedWork.title, selectedWork.type || "Publication"].filter(Boolean),
      judgement: "Use Ask to interpret this work against the bound research context.",
      facts: [
        selectedWork.relationship ? `Theme · ${selectedWork.relationship}` : null,
        "Ask opens with this work as context.",
      ].filter(Boolean).slice(0, 4),
      unknowns: [],
      primaryAction: { id: "ask-work", label: "Ask about this work" },
      secondaryActions: [],
      loadingLabel: null,
    };
  }

  if (bound) {
    const name = profile.name_en || profile.name || "Faculty";
    const role = [profile.title, profile.discipline].filter(Boolean).join(" · ") || "Faculty profile";
    const papers = profile.paper_count_parsed || profile.paper_count;
    return {
      status: "context",
      identity: [name, role],
      judgement: "Bound research context shapes Discover ranking and Ask on this browser.",
      facts: [
        profile.email ? `Bound email · ${profile.email}` : null,
        papers ? `${papers} works indexed` : null,
        "Not a sign-in — browser-local research context only.",
      ].filter(Boolean).slice(0, 4),
      unknowns: [],
      primaryAction: null,
      secondaryActions: [],
      loadingLabel: null,
    };
  }

  return {
    status: "unbound",
    identity: ["Desk unbound", "No faculty email on this browser"],
    judgement: "Connect a faculty email in Settings to load Memory, Works, and Lab.",
    facts: ["Ranking uses generic desk defaults until bound."],
    unknowns: ["Faculty identity", "Research memory", "Lab links"],
    primaryAction: { id: "connect-email", label: "Connect faculty email", tab: "settings" },
    secondaryActions: [],
    loadingLabel: null,
  };
}

export function assertNoExamplePrimary(mode, command) {
  if (mode !== "unbound") return true;
  const label = String(command?.label || "").toLowerCase();
  return !/example|bind example|pilot/.test(label);
}
