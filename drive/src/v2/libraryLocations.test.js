import test from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_DIRECTORY_PAGE_SIZE,
  isBrowsableLibraryLocation,
  libraryLocationStatusLabel,
  normalizeLibraryLocations,
  normalizeProviderDirectoryPage,
  providerDirectoryRequest,
} from "./libraryLocations.js";

test("supported external locations stay visible while disconnected", () => {
  const locations = normalizeLibraryLocations();
  assert.deepEqual(locations.map((item) => item.id), ["all", "google_drive", "dropbox"]);
  assert.equal(locations[1].state, "disconnected");
  assert.equal(locations[2].state, "disconnected");
  assert.equal(libraryLocationStatusLabel(locations[1]), "Not connected");
  assert.equal(isBrowsableLibraryLocation(locations[1], true), false);
});

test("a ready provider preserves account identity and becomes browsable only with a directory handler", () => {
  const locations = normalizeLibraryLocations([{
    id: "google_drive",
    state: "ready",
    accountId: "g1",
    accountLabel: "Prof. Kong",
    accessMode: "read",
    directoryBrowseAvailable: true,
  }]);
  const drive = locations.find((item) => item.id === "google_drive");
  assert.equal(drive.connected, true);
  assert.equal(drive.accountId, "g1");
  assert.equal(drive.accountLabel, "Prof. Kong");
  assert.equal(drive.accessMode, "read");
  assert.equal(drive.directoryBrowseAvailable, true);
  assert.equal(isBrowsableLibraryLocation(drive, false), false);
  assert.equal(isBrowsableLibraryLocation(drive, true), true);
});

test("provider requests are account-bound, cursor-ready, and bounded", () => {
  assert.deepEqual(providerDirectoryRequest({
    providerId: "dropbox",
    accountId: "d1",
    parentId: "abc",
    cursor: "next",
  }), {
    provider: "dropbox",
    account_id: "d1",
    parent_id: "abc",
    cursor: "next",
    limit: LIBRARY_DIRECTORY_PAGE_SIZE,
  });
  assert.equal(providerDirectoryRequest({ providerId: "google_drive", limit: 999 }).limit, 200);
  assert.throws(() => providerDirectoryRequest({ providerId: "onedrive" }), /Unsupported Library location/);
});

test("provider pages preserve provider identity separately from logical Library identity", () => {
  const page = normalizeProviderDirectoryPage({
    account_id: "g1",
    entries: [
      {
        id: "drive-file-42",
        parent_id: "drive-folder-7",
        name: "asia_daily.csv",
        kind: "file",
        logical_asset_id: "gdelt_asia_daily",
        path: "My Drive/Research/asia_daily.csv",
        content_access: "available",
        version_id: "17",
        content_hash: "md5:abc123",
      },
    ],
    next_cursor: "cursor-2",
    has_more: true,
  });
  assert.equal(page.accountId, "g1");
  assert.equal(page.items[0].accountId, "g1");
  assert.equal(page.items[0].providerItemId, "drive-file-42");
  assert.equal(page.items[0].logicalAssetId, "gdelt_asia_daily");
  assert.equal(page.items[0].versionId, "17");
  assert.equal(page.items[0].contentHash, "md5:abc123");
  assert.equal(page.nextCursor, "cursor-2");
  assert.equal(page.hasMore, true);
});
