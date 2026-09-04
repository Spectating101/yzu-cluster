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


test("verified account is the stable provider account when several are connected", () => {
  const locations = libraryLocationsFromAccountDocument({
    providers: [{ id: "google_drive", capabilities: { directory_browse: true } }],
    accounts: [
      { id: "g-unverified", provider: "google_drive", label: "Personal" },
      { id: "g-verified", provider: "google_drive", label: "Research", verified_at: "2026-09-05T00:00:00Z" },
    ],
  });
  assert.equal(locations.find((item) => item.id === "google_drive")?.accountId, "g-verified");
});


test("remote directory resolves known holdings to canonical Library identity and preserves unknown files", () => {
  const rows = providerDirectoryRows({
    providerId: "google_drive",
    providerLabel: "Google Drive",
    holdings: [{ dataset_id: "asia_panel", name: "Asia panel", analysis_readiness: "instant" }],
    items: [
      { kind: "folder", accountId: "g1", providerItemId: "folder-1", name: "Research", path: "My Drive / Research", childCount: 4 },
      { kind: "file", accountId: "g1", providerItemId: "file-known", name: "asia.csv", logicalAssetId: "asia_panel", path: "My Drive / Research / asia.csv", contentAccess: "available" },
      { kind: "file", accountId: "g1", providerItemId: "file-new", name: "forgotten.csv", path: "My Drive / Research / forgotten.csv", contentAccess: "available" },
    ],
  });
  assert.equal(rows[0].kind, "folder");
  assert.equal(rows[0].id, "remote:google_drive:g1:folder-1");
  assert.equal(rows[0].accountId, "g1");
  assert.equal(rows[1].kind, "dataset");
  assert.equal(rows[1].row.dataset_id, "asia_panel");
  assert.equal(rows[1].row.__provider_holding.account_id, "g1");
  assert.equal(rows[2].kind, "remote_file");
  assert.equal(rows[2].id, "remote:google_drive:g1:file-new");
  assert.equal(rows[2].name, "forgotten.csv");
  assert.equal(rows[2].accountId, "g1");
  assert.equal(filterProviderDirectoryRows(rows, "forgotten").length, 1);
});
