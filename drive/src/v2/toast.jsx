import { useCallback, useState } from "react";

/**
 * Toast with optional scoping metadata for candidate-bound chrome.
 *
 * show(message, kind = "info")
 * show(message, { kind, scope, candidateKey })
 */
export function useToast() {
  const [toast, setToast] = useState(null);

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
    setToast({ message: text, kind, scope, candidateKey });
    window.clearTimeout(useToast._timer);
    useToast._timer = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const dismissIf = useCallback((predicate) => {
    setToast((current) => {
      if (!current) return null;
      try {
        return predicate(current) ? null : current;
      } catch {
        return current;
      }
    });
  }, []);

  const clear = useCallback(() => {
    window.clearTimeout(useToast._timer);
    setToast(null);
  }, []);

  return { toast, show, dismissIf, clear };
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className={`rd-v2-toast ${toast.kind}`}
      role="status"
      data-toast-scope={toast.scope || undefined}
      data-toast-candidate={toast.candidateKey || undefined}
    >
      {toast.message}
    </div>
  );
}
