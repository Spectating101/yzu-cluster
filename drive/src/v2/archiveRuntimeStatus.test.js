import assert from "node:assert/strict";
import test from "node:test";
import { archiveRuntimeStatus } from "./archiveRuntimeStatus.js";

test("a verified canonical archive is not displayed as unknown", () => {
  assert.deepEqual(archiveRuntimeStatus({ desk: { gdrive: {
    ready: true,
    drive_list_ok: true,
    drive_root: "gdrive:Machine_Archive/molina_workbench/Sharpe-Renaissance-data",
  } } }), {
    ready: true,
    known: true,
    label: "Verified",
    detail: "Service-managed partition · Machine_Archive / molina_workbench / Sharpe-Renaissance-data",
  });
});

test("a configured fast health response stays explicit while its live probe is pending", () => {
  const status = archiveRuntimeStatus({ desk: { gdrive: {
    rclone_installed: true,
    ready: null,
    probe_skipped: "non_live_fast_path",
    drive_root: "gdrive:research",
  } } });
  assert.equal(status.label, "Probe pending");
  assert.equal(status.known, true);
  assert.equal(status.ready, false);
});

test("an observed archive failure remains a failure", () => {
  const status = archiveRuntimeStatus({ desk: { gdrive: { ready: false, drive_root: "gdrive:archive" } } });
  assert.equal(status.label, "Needs review");
  assert.equal(status.known, true);
});

test("no archive observation remains explicit absence", () => {
  assert.equal(archiveRuntimeStatus({ desk: {} }).label, "Not reported");
  assert.equal(archiveRuntimeStatus(null).label, "Not checked");
});
