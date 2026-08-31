import assert from "node:assert/strict";
import test from "node:test";
import { archiveRuntimeStatus } from "./archiveRuntimeStatus.js";

test("a verified canonical archive is not displayed as unknown", () => {
  const status = archiveRuntimeStatus({
    desk: {
      gdrive: {
        ready: true,
        drive_list_ok: true,
        archive_authority: "service_managed",
        drive_root: "gdrive:Machine_Archive/molina_workbench/Sharpe-Renaissance-data",
      },
    },
  });
  assert.deepEqual(status, {
    ready: true,
    known: true,
    label: "Verified",
    detail: "Service-managed partition · Machine_Archive / molina_workbench / Sharpe-Renaissance-data",
  });
});

test("an observed archive failure remains a failure", () => {
  const status = archiveRuntimeStatus({ desk: { gdrive: { ready: false, drive_root: "gdrive:archive" } } });
  assert.equal(status.label, "Needs review");
  assert.equal(status.ready, false);
  assert.equal(status.known, true);
});

test("no archive observation remains explicit absence", () => {
  assert.equal(archiveRuntimeStatus({ desk: {} }).label, "Not reported");
  assert.equal(archiveRuntimeStatus(null).label, "Not checked");
});
