import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProviderDirectoryRows,
  libraryLocationsFromAccountDocument,
  providerDirectoryRows,
} from "./libraryFederationRuntime.js";


test("connected storage is not browsable until server advertises directory capability", () => {
  const locations = libraryLocationsFromAccountDocument({
    providers: [
      { id: "google_drive", label: "Google Drive", configured: true, rclone_available: true },
      { id: "dropbox", label: "Dropbox", configured: true, rclone_available: true },
    ],
    accounts: [{ id: "g1", provider: "google_drive", email: "prof@example.edu", verified_at: "2026-09-04T00:00:00Z" }],
  });
  assert.equal(locations.find((item) => item.id === "google_drive")?.state, "indexing");
  assert.equal(locations.find((item) => item.id === "dropbox")?.state, "disconnected");
});


test("advertised provider directory becomes ready without inferring from holdings", () => {
  const locations = libraryLocationsFromAccountDocument({
    providers: [{ id: "google_drive", directory_browse_available: true }],
    accounts: [{ id: "g1", provider: "google_drive", label: "Research account" }],
  });
  const drive = locations.find((item) => item.id === "google_drive");
  assert.equal(drive?.state, "ready");
  assert.equal(drive?.accountId, "g1");
  assert.equal(drive?.directoryBrowseAvailable, true);
});


test("remote directory resolves known holdings to canonical Library identity and preserves unknown files", () => {
  const rows = providerDirectoryRows({
    providerId: "google_drive",
    providerLabel: "Google Drive",
    holdings: [{ dataset_id: "asia_panel", name: "Asia panel", analysis_readiness: "instant" }],
    items: [
      { kind: "folder", providerItemId: "folder-1", name: "Research", path: "My Drive / Research", childCount: 4 },
      { kind: "file", providerItemId: "file-known", name: "asia.csv", logicalAssetId: "asia_panel", path: "My Drive / Research / asia.csv", contentAccess: "available" },
      { kind: "file", providerItemId: "file-new", name: "forgotten.csv", path: "My Drive / Research / forgotten.csv", contentAccess: "available" },
    ],
  });
  assert.equal(rows[0].kind, "folder");
  assert.equal(rows[1].kind, "dataset");
  assert.equal(rows[1].row.dataset_id, "asia_panel");
  assert.equal(rows[2].kind, "remote_file");
  assert.equal(rows[2].name, "forgotten.csv");
  assert.equal(filterProviderDirectoryRows(rows, "forgotten").length, 1);
});
