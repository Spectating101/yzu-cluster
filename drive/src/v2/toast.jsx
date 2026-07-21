import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_VISIBLE_MS = 4050;
const TOAST_EXIT_MS = 150;
let toastSequence = 0;

/**
 * Toast with optional scoping metadata for candidate-bound chrome.
 *
 * show(message, kind = "info")
 * show(message, { kind, scope, candidateKey })
 */
export function useToast() {
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const hideTimerRef = useRef(null);
  const clearTimerRef = useRef(null);

  const commitToast = useCallback((next) => {
    toastRef.current = next;
    setToast(next);
  }, []);

  const clearTimers = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(clearTimerRef.current);
    hideTimerRef.current = null;
    clearTimerRef.current = null;
  }, []);

  const dismissAnimated = useCallback(() => {
    window.clearTimeout(clearTimerRef.current);
    const current = toastRef.current;
    if (current) {
      const exiting = { ...current, phase: "exiting" };
      toastRef.current = exiting;
      setToast(exiting);
    }
    clearTimerRef.current = window.setTimeout(() => commitToast(null), TOAST_EXIT_MS);
  }, [commitToast]);

  useEffect(() => clearTimers, [clearTimers]);

  const show = useCallback((message, kindOrMeta = "info") => {
    const text = String(message || "").trim();
    if (!text) return;
    let kind = "info";
    let scope = undefined;
    let candidateKey = undefined;
    if (typeof kindOrMeta === "string") {
      kind = kindOrMeta;
    } else if (kindOrMeta && typeof kindOrMeta === "object") {
      kind = kindOrMeta.kind || "info";
      scope = kindOrMeta.scope || undefined;
      candidateKey = kindOrMeta.candidateKey || undefined;
    }

    clearTimers();
    commitToast({
      id: ++toastSequence,
      message: text,
      kind,
      scope,
      candidateKey,
      phase: "entered",
    });
    hideTimerRef.current = window.setTimeout(dismissAnimated, TOAST_VISIBLE_MS);
  }, [clearTimers, commitToast, dismissAnimated]);

  const dismissIf = useCallback((predicate) => {
    const current = toastRef.current;
    if (!current) return;
    try {
      if (!predicate(current)) return;
      clearTimers();
      commitToast(null);
    } catch {
      /* Keep the current toast when a caller predicate is invalid. */
    }
  }, [clearTimers, commitToast]);

  const clear = useCallback(() => {
    clearTimers();
    commitToast(null);
  }, [clearTimers, commitToast]);

  return { toast, show, dismissIf, clear };
}

export function Toast({ toast }) {
  if (!toast) return null;
  const urgent = toast.kind === "error";
  return (
    <div
      key={toast.id}
      className={`rd-v2-toast ${toast.kind}${toast.phase === "exiting" ? " exiting" : ""}`}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
      data-toast-scope={toast.scope || undefined}
      data-toast-candidate={toast.candidateKey || undefined}
    >
      {toast.message}
    </div>
  );
}
