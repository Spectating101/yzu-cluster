import { API, fetchJson } from "./api.js";

function apiPath(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  const route = value.startsWith("/api/") ? value.slice(4) : value;
  return `${API}${route.startsWith("/") ? route : `/${route}`}`;
}

export async function prepareLibraryPackage({ researchNeed = "", datasetIds = [] } = {}) {
  const ids = [...new Set((datasetIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one dataset in your Library.");
  return fetchJson("/library/packages/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ research_need: String(researchNeed || "").trim(), dataset_ids: ids }),
  });
}

export function libraryPackageDownloadHref(result) {
  return apiPath(result?.download_path || result?.archive?.download_path || "");
}
