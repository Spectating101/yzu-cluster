import { createContext, useContext } from "react";
import { shortSourceLabel } from "./sourceLabel.js";
/** Shared v2 page chrome — matches docs/design/references/desk-v2-1440.html */

export function PageHead({ title, state, lead, actions }) {
  return (
    <header className="rd-v2-page-head">
      <div className="rd-v2-page-head-text">
        {title ? <h1>{title}</h1> : null}
        {state ? <div className="rd-v2-page-state">{state}</div> : null}
        {lead ? <p className="rd-v2-lead rd-v2-visually-hidden">{lead}</p> : null}
      </div>
      {actions ? <div className="rd-v2-page-head-actions">{actions}</div> : null}
    </header>
  );
}

export function PageShell({ title, state, lead, headExtra, toolbar, footer, children, narrow = false, className = "", surfaceState }) {
  return (
    <div
      className={`rd-v2-page${narrow ? " narrow" : ""}${className ? ` ${className}` : ""}`}
      data-surface-state={surfaceState || undefined}
    >
      {(title || lead || headExtra) ? <PageHead title={title} state={state} lead={lead} actions={headExtra} /> : null}
      {toolbar ? <div className="rd-v2-toolbar">{toolbar}</div> : null}
      <div className="rd-v2-body-scroll">{children}</div>
      {footer ? <div className="rd-v2-scroll-foot">{footer}</div> : null}
    </div>
  );
}

export function Chip({ active, warn, children, onClick, className = "", ...rest }) {
  const cls = [
    "rd-v2-chip",
    active ? "on" : "",
    warn ? "warn" : "",
    onClick ? "clickable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return <span className={cls} {...rest}>{children}</span>;
}

export function Strip({ warn, children, actionLabel, onAction }) {
  return (
    <div className={`rd-v2-strip${warn ? " warn" : ""}`}>
      <span>{children}</span>
      {actionLabel ? (
        <button type="button" className="rd-v2-text-link" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Card({ title, children, actions }) {
  return (
    <div className="rd-v2-card">
      {title ? <h3>{title}</h3> : null}
      {children}
      {actions ? <div className="rd-v2-card-actions">{actions}</div> : null}
    </div>
  );
}

export function SourceRibbon({ source }) {
  const raw = String(source || "").trim();
  const key = raw.toLowerCase();
  const looksInternal = /_/.test(raw);
  let label = !raw ? "WEB" : looksInternal ? "SOURCE" : shortSourceLabel(raw);
  let tone = "neutral";
  if (key.includes("twse") || key.includes("taiwan stock exchange")) { label = "TWSE"; tone = "tw"; }
  else if (key.includes("mops")) { label = "MOPS"; tone = "tw"; }
  else if (key.includes("hugging")) { label = "HF"; tone = "hf"; }
  else if (key.includes("sec")) { label = "SEC"; tone = "sec"; }
  else if (key.includes("bigquery") || key === "bq") { label = "BQ"; tone = "bq"; }
  else if (key.includes("datacite") || key.includes("doi")) { label = "DOI"; tone = "doi"; }
  else if (key.includes("gdelt")) { label = "GDELT"; tone = "gdelt"; }
  else if (key.includes("refinitiv") || key.includes("lseg")) { label = "LSEG"; tone = "warn"; }
  else if (key === "bls" || key.includes("bureau of labor statistics")) { label = "BLS"; }
  else if (key.includes("federal reserve") || key === "fred") { label = "FRED"; }
  else if (key.includes("yahoo")) { label = "YAHOO"; }
  else if (/\blab\b/.test(key) || key.includes("registry") || key.includes("vault")) {
    label = "LAB";
    tone = "lab";
  }
  return <span className={`rd-v2-source-ribbon ${tone}`}>{label}</span>;
}

export const StatementHeadingLevel = createContext(2);

export function StatementSection({ title, action, children }) {
  const Heading = `h${useContext(StatementHeadingLevel)}`;
  return (
    <section className="rd-v2-statement-section">
      <div className="rd-v2-statement-head">
        <Heading>{title}</Heading>
        {action}
      </div>
      <div className="rd-v2-statement-body">{children}</div>
    </section>
  );
}

export function StatementRow({ label, metric, sublabel, detail, warn, active, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`rd-v2-statement-row${warn ? " warn" : ""}${active ? " on" : ""}`}
      onClick={onClick}
    >
      <span className="rd-v2-statement-label">{label}</span>
      <strong className="rd-v2-statement-metric">{metric || "—"}</strong>
      <span className="rd-v2-statement-sub">{sublabel || "—"}</span>
      <span className="rd-v2-statement-detail">{detail || "—"}</span>
    </Tag>
  );
}

