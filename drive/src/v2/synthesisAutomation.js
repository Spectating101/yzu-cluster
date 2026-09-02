import { useEffect, useState } from "react";

const STORAGE_KEY = "rd_v2_synthesis_automation";
const CHANGE_EVENT = "rd:synthesis-automation";

export const SYNTHESIS_AUTOMATION_MODES = Object.freeze({
  MANUAL: "manual",
  AUTO_CHOOSE: "auto_choose",
  AUTO_APPROVE: "auto_approve",
});

export const SYNTHESIS_AUTOMATION_OPTIONS = Object.freeze([
  {
    id: SYNTHESIS_AUTOMATION_MODES.MANUAL,
    label: "Manual",
    short: "Manual",
    detail: "AI suggests and reasons; you choose and approve each authority change.",
  },
  {
    id: SYNTHESIS_AUTOMATION_MODES.AUTO_CHOOSE,
    label: "Auto-choose",
    short: "Auto-choose",
    detail: "AI may resolve supported method decisions and draft the proposal; approvals stay manual.",
  },
  {
    id: SYNTHESIS_AUTOMATION_MODES.AUTO_APPROVE,
    label: "Auto-approve",
    short: "Auto-approve",
    detail: "AI may resolve supported decisions, accept the proposal, Preview it, request execution, and approve the bound job when permitted.",
  },
]);

export function normalizeSynthesisAutomationMode(value) {
  const next = String(value || "").trim().toLowerCase();
  return Object.values(SYNTHESIS_AUTOMATION_MODES).includes(next)
    ? next
    : SYNTHESIS_AUTOMATION_MODES.MANUAL;
}

export function loadSynthesisAutomationMode() {
  try {
    return normalizeSynthesisAutomationMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return SYNTHESIS_AUTOMATION_MODES.MANUAL;
  }
}

export function saveSynthesisAutomationMode(value) {
  const mode = normalizeSynthesisAutomationMode(value);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { mode } }));
  } catch {
    // The active view still receives the returned value even when persistence is unavailable.
  }
  return mode;
}

export function synthesisAutomationAllowsChoice(mode) {
  return [
    SYNTHESIS_AUTOMATION_MODES.AUTO_CHOOSE,
    SYNTHESIS_AUTOMATION_MODES.AUTO_APPROVE,
  ].includes(normalizeSynthesisAutomationMode(mode));
}

export function synthesisAutomationAllowsApproval(mode) {
  return normalizeSynthesisAutomationMode(mode) === SYNTHESIS_AUTOMATION_MODES.AUTO_APPROVE;
}

export function synthesisAutomationOption(mode) {
  const normalized = normalizeSynthesisAutomationMode(mode);
  return SYNTHESIS_AUTOMATION_OPTIONS.find((option) => option.id === normalized)
    || SYNTHESIS_AUTOMATION_OPTIONS[0];
}

export function useSynthesisAutomationMode() {
  const [mode, setModeState] = useState(() => loadSynthesisAutomationMode());

  useEffect(() => {
    const onChange = (event) => {
      setModeState(normalizeSynthesisAutomationMode(event?.detail?.mode));
    };
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setModeState(normalizeSynthesisAutomationMode(event.newValue));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = (value) => {
    const next = saveSynthesisAutomationMode(value);
    setModeState(next);
    return next;
  };

  return [mode, setMode];
}
