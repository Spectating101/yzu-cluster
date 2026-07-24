import { Fragment } from "react";

/** Light Ask-rail formatting — bold, inline code, line breaks. No full markdown. */
export function formatAskText(text) {
  const raw = String(text ?? "");
  if (!raw) return null;
  const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g).filter((part) => part !== "");
  return parts.map((part, i) => {
    if (part === "\n") return <br key={`br-${i}`} />;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={`c-${i}`}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={`t-${i}`}>{part}</Fragment>;
  });
}
