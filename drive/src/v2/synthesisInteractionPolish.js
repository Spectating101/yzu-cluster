const SUBJECT_SELECTORS = [
  '[data-testid="synthesis-scope-block"]',
  '[data-testid="synthesis-unit-conflict"]',
  '[data-testid="synthesis-failed-state"]',
  '[data-testid="synthesis-proposal-state"]',
  '[data-testid="synthesis-join-decision"]',
  '[data-testid="synthesis-preview-state"]',
  '[data-testid="synthesis-execution-state"]',
  '[data-testid="synthesis-registered-state"]',
  '[data-testid="synthesis-query-ready-state"]',
  '[data-testid="synthesis-evidence-proposal"]',
];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const USER_SCROLL_GRACE_MS = 900;
const LANDING_MS = 900;

function entirelyOutsideViewport(element) {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const topGuard = 92;
  const bottomGuard = 56;
  return rect.bottom <= topGuard || rect.top >= viewport - bottomGuard;
}

function surfaceKey(element, root) {
  const identity = element?.getAttribute("data-testid") || element?.className || "";
  const thread = root?.querySelector(".s04-head h1")?.textContent?.trim() || "";
  const subject = element?.querySelector("h2")?.textContent?.trim() || "";
  return [thread, identity, subject].filter(Boolean).join(":");
}

function threadKey(root) {
  return root?.querySelector(".s04-head h1")?.textContent?.trim() || "";
}

function executionIsReview(surface) {
  if (!surface) return false;
  if (surface.querySelector('[data-testid="synthesis-preview-state"]')) return true;
  const current = surface.querySelector(".s04-exec-track li.now strong")?.textContent?.trim().toLowerCase() || "";
  if (current.includes("researcher approval")) return true;
  return /pending approval|approval required|awaiting researcher approval/i.test(surface.textContent || "");
}

function surfacePhase(surface) {
  const testId = surface?.getAttribute("data-testid") || "";
  if (["synthesis-proposal-state", "synthesis-preview-state"].includes(testId)) return "review";
  if (testId === "synthesis-execution-state") return executionIsReview(surface) ? "review" : "execute";
  if (["synthesis-failed-state", "synthesis-registered-state", "synthesis-query-ready-state"].includes(testId)) return "execute";
  return "design";
}

function authoritativeSurface(root) {
  for (const selector of SUBJECT_SELECTORS) {
    const surface = root.querySelector(selector);
    if (surface) return surface;
  }
  return null;
}

/**
 * Lightweight interaction polish for the rendered Synthesis workspace.
 *
 * React remains authoritative for research state. This observer only preserves
 * spatial continuity: consequential surfaces receive a restrained landing cue,
 * while the viewport stays put as decisions evolve inside the same Design,
 * Review, or Execute workspace. A scroll is reserved for a genuine phase
 * transition whose new authoritative surface is completely outside the current
 * viewport, and never overrides recent researcher scrolling.
 */
export function installSynthesisInteractionPolish() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (window.__rdSynthesisInteractionPolishInstalled) return () => {};
  window.__rdSynthesisInteractionPolishInstalled = true;

  let lastSurface = "";
  let lastPhase = "";
  let lastThread = "";
  let lastUserScrollAt = 0;
  let landingTimer = 0;
  let frame = 0;

  const noteUserScroll = () => {
    lastUserScrollAt = performance.now();
  };

  const land = (surface, root) => {
    if (!surface || document.visibilityState !== "visible") return;

    const nextPhase = surfacePhase(surface);
    root.dataset.synthesisWorkspacePhase = nextPhase;

    const key = surfaceKey(surface, root);
    if (!key || key === lastSurface) return;

    const nextThread = threadKey(root);
    const sameThread = Boolean(lastThread && nextThread && lastThread === nextThread);
    const phaseChanged = Boolean(lastPhase && nextPhase !== lastPhase);

    lastSurface = key;
    lastPhase = nextPhase;
    lastThread = nextThread;

    surface.dataset.synthesisLanded = "true";
    window.clearTimeout(landingTimer);
    landingTimer = window.setTimeout(() => {
      delete surface.dataset.synthesisLanded;
    }, LANDING_MS);

    // Most Synthesis state changes are transformations of the same desk. Keep
    // the researcher's spatial memory intact instead of chasing each new panel.
    if (!sameThread || !phaseChanged) return;
    if (!entirelyOutsideViewport(surface)) return;
    if (performance.now() - lastUserScrollAt < USER_SCROLL_GRACE_MS) return;

    const reduced = window.matchMedia?.(REDUCED_MOTION)?.matches;
    surface.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  };

  const inspect = () => {
    frame = 0;
    const root = document.querySelector(".rd-v2-synthesis-page");
    if (!root) return;
    const surface = authoritativeSurface(root);
    if (!surface) {
      root.dataset.synthesisWorkspacePhase = "design";
      return;
    }
    land(surface, root);
  };

  const scheduleInspect = () => {
    if (!frame) frame = window.requestAnimationFrame(inspect);
  };

  const observer = new MutationObserver(scheduleInspect);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-testid", "class"],
  });
  window.addEventListener("scroll", noteUserScroll, { passive: true, capture: true });
  document.addEventListener("visibilitychange", scheduleInspect);
  scheduleInspect();

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", noteUserScroll, { capture: true });
    document.removeEventListener("visibilitychange", scheduleInspect);
    if (frame) window.cancelAnimationFrame(frame);
    window.clearTimeout(landingTimer);
    delete window.__rdSynthesisInteractionPolishInstalled;
  };
}

if (typeof window !== "undefined") installSynthesisInteractionPolish();
