const SUBJECT_SELECTORS = [
  '[data-testid="synthesis-scope-block"]',
  '[data-testid="synthesis-unit-conflict"]',
  '[data-testid="synthesis-proposal-state"]',
  '[data-testid="synthesis-join-decision"]',
  '[data-testid="synthesis-execution-state"]',
  '[data-testid="synthesis-failed-state"]',
  '[data-testid="synthesis-registered-state"]',
  '[data-testid="synthesis-query-ready-state"]',
  '[data-testid="synthesis-evidence-proposal"]',
].join(",");

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const USER_SCROLL_GRACE_MS = 900;
const LANDING_MS = 900;

function visibleEnough(element) {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const topGuard = 92;
  const bottomGuard = 56;
  return rect.top >= topGuard && Math.min(rect.bottom, viewport) >= Math.min(rect.top + 96, rect.bottom) && rect.top < viewport - bottomGuard;
}

function surfaceKey(element) {
  return element?.getAttribute("data-testid") || element?.className || "";
}

/**
 * Lightweight interaction polish for the rendered Synthesis workspace.
 *
 * This deliberately does not make research decisions, click controls, or move
 * keyboard focus. React remains authoritative for state. The observer only
 * helps a newly-authoritative surface land in view after that state changes.
 */
export function installSynthesisInteractionPolish() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (window.__rdSynthesisInteractionPolishInstalled) return () => {};
  window.__rdSynthesisInteractionPolishInstalled = true;

  let lastSurface = "";
  let lastUserScrollAt = 0;
  let landingTimer = 0;
  let frame = 0;

  const noteUserScroll = () => {
    lastUserScrollAt = performance.now();
  };

  const land = (surface) => {
    if (!surface || document.visibilityState !== "visible") return;
    const key = surfaceKey(surface);
    if (!key || key === lastSurface) return;
    lastSurface = key;

    surface.dataset.synthesisLanded = "true";
    window.clearTimeout(landingTimer);
    landingTimer = window.setTimeout(() => {
      delete surface.dataset.synthesisLanded;
    }, LANDING_MS);

    if (visibleEnough(surface)) return;
    if (performance.now() - lastUserScrollAt < USER_SCROLL_GRACE_MS) return;

    const reduced = window.matchMedia?.(REDUCED_MOTION)?.matches;
    surface.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  };

  const inspect = () => {
    frame = 0;
    const root = document.querySelector(".rd-v2-synthesis-page");
    if (!root) return;
    land(root.querySelector(SUBJECT_SELECTORS));
  };

  const scheduleInspect = () => {
    if (!frame) frame = window.requestAnimationFrame(inspect);
  };

  const observer = new MutationObserver(scheduleInspect);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-testid", "class"] });
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
