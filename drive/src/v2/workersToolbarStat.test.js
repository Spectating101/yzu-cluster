import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWorkersToolbarStat,
  workersToolbarFieldsFromRollup,
} from "./workersToolbarStat.js";

test("mixed joined+stale does not collapse to 0/N online", () => {
  assert.equal(
    formatWorkersToolbarStat({ online: 0, joined: 3, stale: 3, total: 4 }),
    "3 joined · 3 stale / 4",
  );
  assert.equal(
    formatWorkersToolbarStat({ joined: 0, stale: 3, total: 4, online: 0 }),
    "0 joined · 3 stale / 4",
  );
  assert.doesNotMatch(
    formatWorkersToolbarStat({ online: 0, joined: 3, stale: 3, total: 4 }),
    /online|available|busy/i,
  );
});

test("fresh+stale phrase stays explicit and preserves total", () => {
  assert.equal(
    formatWorkersToolbarStat({ fresh: 0, stale: 3, total: 3 }),
    "0 fresh · 3 stale / 3",
  );
});

test("available is used only when that field is explicitly supplied", () => {
  assert.equal(formatWorkersToolbarStat({ available: 2, total: 4 }), "2/4 available");
  assert.notEqual(formatWorkersToolbarStat({ online: 2, total: 4 }), "2/4 available");
  assert.equal(formatWorkersToolbarStat({ online: 2, total: 4 }), "2/4 online");
});

test("joined is never aliased as online", () => {
  assert.equal(formatWorkersToolbarStat({ joined: 0, total: 4 }), "0/4 joined");
  assert.equal(formatWorkersToolbarStat({ busy: 2, total: 12 }), "2/12 busy");
});

test("rollup field merge keeps compute joined/stale without inventing available", () => {
  const fields = workersToolbarFieldsFromRollup({
    hero: { workers: { busy: 0, total: 4, online: 0 } },
    compute: {
      windows_lab: { joined: 3, total: 4 },
      runtime: { worker_pools: { total: 4, online: 0, stale: 3, busy: 0 } },
    },
  });
  assert.equal(fields.joined, 3);
  assert.equal(fields.stale, 3);
  assert.equal(fields.online, 0);
  assert.equal(fields.available, undefined);
  assert.equal(formatWorkersToolbarStat(fields), "3 joined · 3 stale / 4");
});

test("runtime stale wins over hero stale:0 and drops conflicting available", () => {
  const fields = workersToolbarFieldsFromRollup({
    hero: {
      workers: {
        busy: 0,
        total: 4,
        online: 0,
        joined: 3,
        stale: 0,
        available: 3,
      },
    },
    compute: {
      windows_lab: { joined: 3, total: 4, online: 0, stale: 0, available: 3 },
      runtime: { worker_pools: { total: 4, busy: 0, stale: 3 } },
    },
  });
  assert.equal(fields.joined, 3);
  assert.equal(fields.stale, 3);
  assert.equal(fields.available, undefined);
  assert.equal(formatWorkersToolbarStat(fields), "3 joined · 3 stale / 4");
  assert.doesNotMatch(formatWorkersToolbarStat(fields), /online|available/i);
});

test("online/total preserved when joined/stale are absent", () => {
  assert.equal(formatWorkersToolbarStat({ online: 0, total: 4 }), "0/4 online");
  assert.equal(formatWorkersToolbarStat({ online: 2, total: 4 }), "2/4 online");
});
