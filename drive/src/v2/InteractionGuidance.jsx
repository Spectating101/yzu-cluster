import { useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { CircleHelp } from "lucide-react";

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
