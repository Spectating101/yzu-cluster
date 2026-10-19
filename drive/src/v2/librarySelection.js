export function resolveLibrarySelection({ selectedId, holdings, fallback } = {}) {
  const id = String(selectedId || "").trim();
  if (!id) return null;
  const fromHoldings = (holdings || []).find((row) => String(row?.dataset_id || "") === id);
  if (fromHoldings) return fromHoldings;
  if (String(fallback?.dataset_id || "") === id) return fallback;
  return { dataset_id: id };
}
