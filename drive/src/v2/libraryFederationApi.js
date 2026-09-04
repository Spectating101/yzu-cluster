import { fetchJson } from "./api.js";
import { normalizeProviderDirectoryPage, providerDirectoryRequest } from "./libraryLocations.js";

/**
 * Provider-neutral directory endpoint. The private API owns OAuth credentials,
 * provider SDK/rclone details, permission checks, and provider cursors.
 */
export async function listLibraryProviderDirectory({
  providerId,
  parentId = "",
  cursor = "",
  limit,
} = {}) {
  const request = providerDirectoryRequest({ providerId, parentId, cursor, limit });
  const params = new URLSearchParams();
  params.set("provider", request.provider);
  if (request.parent_id) params.set("parent_id", request.parent_id);
  if (request.cursor) params.set("cursor", request.cursor);
  params.set("limit", String(request.limit));
  const payload = await fetchJson(`/library/folders?${params.toString()}`, { timeoutMs: 20_000 });
  return normalizeProviderDirectoryPage(payload);
}
