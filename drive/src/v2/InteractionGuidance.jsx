import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, CircleHelp, X } from "lucide-react";

export function InteractionProvider({ children }) {
  return (
    <TooltipPrimitive.Provider delayDuration={420} skipDelayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function ContextHelp({
  content,
  label = "More information",
  side = "top",
  align = "center",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  if (!content) return null;

  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          className={`rd-v2-context-help${className ? ` ${className}` : ""}`}
          aria-label={label}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          <CircleHelp aria-hidden="true" />
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="rd-v2-tooltip"
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
        >
          <span>{content}</span>
          <TooltipPrimitive.Arrow className="rd-v2-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function placePopover(trigger) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(360, Math.max(280, window.innerWidth - 24));
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - width / 2),
    Math.max(12, window.innerWidth - width - 12),
  );
  const roomBelow = window.innerHeight - rect.bottom;
  const placeBelow = roomBelow > 310 || rect.top < 310;
  return {
    width,
    left,
    top: placeBelow ? rect.bottom + 10 : undefined,
    bottom: placeBelow ? undefined : window.innerHeight - rect.top + 10,
    transformOrigin: placeBelow ? "top center" : "bottom center",
  };
}

export function RichContextHelp({
  title,
  summary,
  checks = [],
  next,
  label = "Explain this state",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      if (triggerRef.current) setPosition(placePopover(triggerRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!title && !summary) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`rd-v2-context-help rd-v2-context-help-rich${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <CircleHelp aria-hidden="true" />
      </button>
      {open && position
        ? createPortal(
            <section
              ref={panelRef}
              id={panelId}
              className="rd-v2-rich-popover"
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              style={position}
              data-testid="rich-context-popover"
            >
              <header>
                <div>
                  <span>Research Drive state</span>
                  <h3 id={titleId}>{title}</h3>
                </div>
                <button
                  type="button"
                  className="rd-v2-rich-popover-close"
                  aria-label="Close explanation"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </header>
              {summary ? <p className="rd-v2-rich-popover-summary">{summary}</p> : null}
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
              {next ? (
                <footer>
                  <span>Safest next step</span>
                  <strong>{next}</strong>
                </footer>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
