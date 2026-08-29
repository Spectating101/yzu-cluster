function apiPath(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (value.startsWith("/api/")) return value;
  if (value === "/api") return value;
  return `/api${value.startsWith("/") ? value : `/${value}`}`;
}

async function readJson(response) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Package request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function prepareLibraryPackage({ researchNeed = "", datasetIds = [] } = {}) {
  const ids = [...new Set((datasetIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Select at least one held Library asset.");
  const response = await fetch("/api/library/packages/prepare", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ research_need: String(researchNeed || "").trim(), dataset_ids: ids }),
  });
  return readJson(response);
}

export function libraryPackageDownloadHref(result) {
  return apiPath(result?.download_path || result?.archive?.download_path || "");
}
