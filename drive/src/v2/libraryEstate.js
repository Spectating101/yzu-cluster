import { DRIVE_LAB, consumerDatasetPath } from "@/driveTree";
import { statusPillKind } from "@/v2/datasetMeta";

const COLLECTIONS = Object.freeze({
  research_panels: {
    title: "Research panels",
    description: "Derived and analysis-ready research assets",
    tone: "derived",
  },
  procured: {
    title: "Acquired data",
    description: "Data collected through Research Drive",
    tone: "acquired",
  },
  reference: {
    title: "Reference data",
    description: "Entity maps and official reference datasets",
    tone: "reference",
  },
  connections: {
    title: "Connected sources",
    description: "Remote and query-time data access",
    tone: "connected",
  },
  lab_pipelines: {
    title: "Data pipelines",
    description: "Ingestion, catalogs, and operational datasets",
    tone: "pipeline",
  },
  campaigns: {
    title: "Research campaigns",
    description: "Active collection and research workstreams",
    tone: "campaign",
  },
  other: {
    title: "Other assets",
    description: "Registry assets not yet organized into a collection",
    tone: "other",
  },
});

function cleanPath(value) {
  return String(value || "")
    .replace(/^data_lake\//, "")
    .replace(/^\/+|\/+$/g, "");
}

export function datasetBelongsToFolder(row, folderId) {
  const folder = cleanPath(folderId);
  if (!folder) return false;
  const treePath = consumerDatasetPath(row, DRIVE_LAB).join("/");
  const rawPath = cleanPath(row?.local_path || row?.local_root);
  if (treePath === folder || treePath.startsWith(`${folder}/`)) return true;
  if (rawPath === folder || rawPath.startsWith(`${folder}/`)) return true;

  const leaf = folder.split("/").filter(Boolean).pop()?.toLowerCase();
  if (!leaf || leaf.length < 3) return false;
  const hay = [
    row?.dataset_id,
    row?.name,
    row?.source,
    row?.publisher,
    row?.backend,
    row?.domain,
    row?.local_root,
    row?.local_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(leaf);
}

export function libraryAssetCounts(rows = []) {
  const counts = {
    total: rows.length,
    queryReady: 0,
    connected: 0,
    metadataOnly: 0,
    unknown: 0,
  };
  for (const row of rows) {
    const kind = statusPillKind(row).kind;
    if (kind === "query-ready") counts.queryReady += 1;
    else if (kind === "connected") counts.connected += 1;
    else if (kind === "remote") counts.metadataOnly += 1;
    else if (kind === "unknown") counts.unknown += 1;
  }
  return counts;
}

export function collectionDescriptor(folder) {
  const segment = String(folder?.segment || folder?.id || "").split("/")[0];
  const known = COLLECTIONS[segment];
  if (known) return known;
  return {
    title: folder?.name || "Collection",
    description: "Research assets organized in this collection",
    tone: "default",
  };
}

export function collectionEstateSummary(folder, datasets = []) {
  const rows = datasets.filter((row) => datasetBelongsToFolder(row, folder?.id));
  return {
    ...collectionDescriptor(folder),
    counts: libraryAssetCounts(rows),
  };
}

export function assetPurpose(row) {
  return String(row?.description || row?.recommended_use || row?.subtitle || "").trim();
}

export function assetMeta(row) {
  const values = [
    row?.coverage || row?.date_range || row?.temporal_coverage,
    row?.grain,
    row?.source || row?.source_system || row?.publisher,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ")))];
}

export function assetTypeLabel(row) {
  const readiness = statusPillKind(row).kind;
  const path = String(row?.local_path || row?.local_root || "").toLowerCase();
  const domain = String(row?.domain || "").toLowerCase();
  if (readiness === "connected") return "Connected source";
  if (domain === "procured" || path.includes("procured")) return "Acquired asset";
  if (path.includes("research_panels") || domain === "derived") return "Derived panel";
  if (readiness === "remote") return "Catalog record";
  return "Lab dataset";
}
