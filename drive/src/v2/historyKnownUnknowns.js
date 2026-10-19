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
  if (archive === true) known.push("Archive verified");
  else if (archive === false) unknowns.push("Archive not verified");

  const readback = pick(meta.registry_readback, event?.registry_readback);
  if (readback === true) known.push("Registry read-back confirmed");
  else if (readback === false) unknowns.push("Registry read-back not confirmed");

  const catalog = text(
    meta.catalog_reconciliation?.state || event?.catalog_reconciliation?.state,
  );
  if (catalog) {
    if (RECONCILED.has(catalog.toLowerCase())) known.push("Catalog reconciled");
    else unknowns.push(`Catalog reconciliation ${catalog}`);
  }

  if (truth?.registered === true) known.push("Registered in catalog");
  if (truth?.receiptOnly === true) unknowns.push("Holding is receipt-only");

  const preview = pick(meta.preview_supported, event?.preview_supported);
  if (preview === true) known.push("Bounded preview retained");

  return {
    known,
    unknowns,
    hasEvidence: known.length > 0 || unknowns.length > 0,
  };
}

export const NO_EVIDENCE_YET = "Nothing has been verified for this record yet.";
