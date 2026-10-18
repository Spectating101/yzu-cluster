import { MEMBERS_ONLY_TEXT } from "@/v2/licensedAccess";
import { coverageText } from "./coverageText.js";

const text = (value) => String(value ?? "").trim();
const grainLabel = (grain) => text(grain).replace(/_/g, " ");

export function licensedFacts(dataset, columns = []) {
  const rows = Number(dataset?.row_count || dataset?.rows);
  const keys = Array.isArray(dataset?.join_keys) ? dataset.join_keys.filter(Boolean) : [];
  return [
    ["Size", Number.isFinite(rows) && rows > 0 ? `${rows.toLocaleString("en-US")} rows` : ""],
    ["Coverage", coverageText(dataset?.coverage)],
    ["One row per", grainLabel(dataset?.grain)],
    ["Joins on", keys.join(", ")],
    ["Best for", text(dataset?.best_use || dataset?.recommended_use)],
    ["Columns", columns.slice(0, 14).join(", ")],
    ["Limits", text(dataset?.limitations)],
  ].filter(([, value]) => value);
}

export function LicensedBrief({ dataset, columns }) {
  const facts = licensedFacts(dataset, columns);
  return (
    <div className="rd-v2-library-licensed-brief" data-testid="library-members-only">
      {facts.map(([label, value]) => (
        <div key={label}>
          <span className="rd-v2-eyebrow">{label}</span>
          <p>{value}</p>
        </div>
      ))}
      <div className="is-wide">
        <span className="rd-v2-eyebrow">Access</span>
        <p>{MEMBERS_ONLY_TEXT}</p>
      </div>
    </div>
  );
}
