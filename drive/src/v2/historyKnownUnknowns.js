const RECONCILED = new Set(["reconciled", "confirmed", "complete", "completed"]);

function text(value) {
  return String(value ?? "").replace(/_/g, " ").trim();
}

function pick(primary, fallback) {
  return primary != null ? primary : fallback;
}

export function historyKnownUnknowns(event, truth) {
  const meta = event?.meta || {};
  const known = [];
  const unknowns = [];

  const archive = pick(meta.archive_verified, event?.archive_verified);
  if (archive === true) known.push("Archived copy verified");
  else if (archive === false) unknowns.push("Archived copy not verified");

  const readback = pick(meta.registry_readback, event?.registry_readback);
  if (readback === true && truth?.receiptOnly === true) {
    known.push("The save record includes evidence that the Library record was read back");
  } else if (readback === true) known.push("Library record confirmed");
  else if (readback === false) unknowns.push("Library record not confirmed");

  const catalog = text(
    meta.catalog_reconciliation?.state || event?.catalog_reconciliation?.state,
  );
  if (catalog) {
    if (catalog.toLowerCase() === "catalog loaded") known.push("Current Library record loaded");
    else if (RECONCILED.has(catalog.toLowerCase())) known.push("Library listing up to date");
    else unknowns.push(`Library listing ${catalog}`);
  }

  if (truth?.registered === true && truth?.receiptOnly !== true) known.push("Listed in the Library");
  if (truth?.receiptOnly === true) unknowns.push("Current Library listing not loaded");

  const preview = pick(meta.preview_supported, event?.preview_supported);
  if (preview === true) known.push("Sample preview saved");

  return {
    known,
    unknowns,
    hasEvidence: known.length > 0 || unknowns.length > 0,
  };
}

export const NO_EVIDENCE_YET = "Nothing has been verified for this record yet.";
