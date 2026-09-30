function toGb(value, unit) {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return unit === "TB" ? n * 1000 : n;
}

function amount(gb, unit) {
  if (unit === "TB") {
    const tb = gb / 1000;
    return String(Number(tb >= 10 ? tb.toFixed(1) : tb.toFixed(2)));
  }
  return String(Math.round(gb));
}

export function storageUsed(used, total, unit = "GB") {
  const usedGb = toGb(used, unit);
  const totalGb = toGb(total, unit);
  if (usedGb === null) return "";
  const scale = Math.max(usedGb, totalGb ?? 0) >= 1000 ? "TB" : "GB";
  if (totalGb === null) return `${amount(usedGb, scale)} ${scale} used`;
  return `${amount(usedGb, scale)} of ${amount(totalGb, scale)} ${scale} used`;
}

export function storageFree(free, unit = "GB") {
  const gb = toGb(free, unit);
  if (gb === null) return "";
  const scale = gb >= 1000 ? "TB" : "GB";
  return `${amount(Math.max(0, gb), scale)} ${scale} free`;
}
