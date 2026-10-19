import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

export function useElapsedSeconds(active) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return seconds;
}

function elapsedLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

export function ProgressSteps({
  active = false,
  activeText = "",
  label = "Operation progress",
  className = "",
}) {
  const elapsed = useElapsedSeconds(active);

  if (!active) return null;

  const activeStage = String(activeText || "").trim() || "Working…";

  return (
    <section
      className={`rd-v2-progress-card${className ? ` ${className}` : ""}`}
      aria-label={label}
      data-active-step={1}
      data-testid="interaction-progress"
    >
      <span className="rd-v2-progress-announcement" role="status" aria-live="polite" aria-atomic="true">
        {activeStage}
      </span>
      <div className="rd-v2-progress-card-head">
        <div className="rd-v2-progress-card-title">
          <LoaderCircle aria-hidden="true" />
          <strong>{activeStage}</strong>
        </div>
        <span className="rd-v2-progress-card-meta" aria-hidden="true">
          <span className="rd-v2-progress-live-dot" />
          Active · {elapsedLabel(elapsed)}
        </span>
      </div>
      <div
        className="rd-v2-progress-phase-track"
        role="progressbar"
        aria-label={`${label}: ${activeStage}`}
        aria-valuetext={activeStage}
      >
        <span className="rd-v2-progress-phase-fill" aria-hidden="true" />
      </div>
    </section>
  );
}

export function Skeleton({ className = "", lines = 1, label = "Loading" }) {
  return (
    <div
      className={`rd-v2-skeleton${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={label}
      data-testid="interaction-skeleton"
    >
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={index === lines - 1 ? "short" : ""} aria-hidden="true" />
      ))}
    </div>
  );
}

export function GuidedState({ eyebrow, title, detail, checks = [], actions, className = "" }) {
  return (
    <section className={`rd-v2-guided-state${className ? ` ${className}` : ""}`}>
      {eyebrow ? <p className="rd-v2-guided-state-eyebrow">{eyebrow}</p> : null}
      <h3>{title}</h3>
      {detail ? <p>{detail}</p> : null}
      {checks.length ? (
        <ul>
          {checks.map((item) => (
            <li key={item}>
              <Check aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {actions ? <div className="rd-v2-guided-state-actions">{actions}</div> : null}
    </section>
  );
}
