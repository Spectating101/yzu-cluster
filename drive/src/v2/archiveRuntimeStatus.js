/**
 * Browser-safe projection of the service-owned canonical archive.
 *
 * This is intentionally separate from Connected Storage: the archive holds
 * Research Drive's shared/default evidence, while connected accounts are
 * principal-owned optional sources.
 */
function readableRoot(value) {
  const raw = String(value || "").trim();
  const path = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  return path.replace(/^\/+/, "").split("/").filter(Boolean).join(" / ");
}

export function archiveRuntimeStatus(health) {
  if (health == null) {
    return {
      ready: false,
      known: false,
      label: "Not checked",
      detail: "Open system status to verify the service archive",
    };
  }
  const archive = health?.desk?.gdrive;
  if (!archive || typeof archive !== "object") {
    return {
      ready: false,
      known: false,
      label: "Not reported",
      detail: "The desk has not reported its canonical archive",
    };
  }
  const root = readableRoot(archive.drive_root);
  const scope = root ? `Service-managed partition · ${root}` : "Service-managed canonical archive";
  const ready = archive.ready === true || archive.ok === true || archive.drive_list_ok === true;
  if (ready) {
    return { ready: true, known: true, label: "Verified", detail: scope };
  }
  if (archive.ready === false || archive.ok === false || archive.drive_list_ok === false) {
    return { ready: false, known: true, label: "Needs review", detail: scope };
  }
  return {
    ready: false,
    known: true,
    label: "Probe pending",
    detail: scope,
  };
}
