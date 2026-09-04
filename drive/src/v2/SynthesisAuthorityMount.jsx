import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  SYNTHESIS_AUTOMATION_OPTIONS,
  synthesisAutomationOption,
  useSynthesisAutomationMode,
} from "@/v2/synthesisAutomation.js";

/**
 * Workspace-level authority mount.
 *
 * The permission is application state shared with Ask/Autopilot, but its human
 * control belongs beside the active Synthesis consequence. Nothing is rendered
 * on Synthesis Home because no durable thread is selected there.
 */
export function SynthesisAuthorityMount() {
  const [target, setTarget] = useState(null);
  const [mode, setMode] = useSynthesisAutomationMode();
  const option = synthesisAutomationOption(mode);

  useEffect(() => {
    let frame = 0;
    const syncTarget = () => {
      const next = document.querySelector(".rd-v2-synthesis-page .s04-head > em");
      setTarget((current) => (current === next ? current : next));
    };
    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncTarget);
    };

    syncTarget();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!target) return null;
  return createPortal(
    <span
      className={`rd-v2-synthesis-page-authority is-${mode}`}
      data-testid="synthesis-authority-control"
      title={option.detail}
    >
      <span>AI authority</span>
      <select
        aria-label="Synthesis agent authority"
        data-testid="synthesis-automation-mode"
        value={mode}
        onChange={(event) => setMode(event.target.value)}
      >
        {SYNTHESIS_AUTOMATION_OPTIONS.map((automationOption) => (
          <option key={automationOption.id} value={automationOption.id}>{automationOption.short}</option>
        ))}
      </select>
    </span>,
    target,
  );
}

export default SynthesisAuthorityMount;
