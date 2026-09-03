import { useEffect } from "react";
import {
  clearSynthesisObjectContextSelection,
  contextFromSynthesisSurface,
  emitSynthesisObjectContext,
  synthesisContextSurfaceSelector,
} from "@/v2/synthesisObjectContext.js";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "summary",
  "label",
  '[role="button"]',
  '[contenteditable="true"]',
].join(", ");

function openAskRail() {
  const tabs = Array.from(document.querySelectorAll('.yzu-inspector [role="tab"]'));
  const askTab = tabs.find((tab) => String(tab.textContent || "").trim().toLowerCase() === "ask");
  if (askTab instanceof HTMLElement && askTab.getAttribute("aria-selected") !== "true") askTab.click();
}

export function SynthesisObjectContextMount() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const surfaceSelector = synthesisContextSurfaceSelector();
    const onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".rd-v2-synthesis-page")) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      const surface = target.closest(surfaceSelector);
      if (!surface) return;
      const context = contextFromSynthesisSurface(surface);
      if (!context) return;
      clearSynthesisObjectContextSelection();
      surface.setAttribute("data-synthesis-context-selected", "true");
      emitSynthesisObjectContext(context);
      openAskRail();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

export default SynthesisObjectContextMount;
