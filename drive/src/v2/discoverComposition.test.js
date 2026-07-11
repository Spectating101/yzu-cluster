import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupDiscoverBrowseRows } from "./discoverComposition.js";

describe("groupDiscoverBrowseRows", () => {
  it("buckets by taxonomy group into lab / external / needs access", () => {
    const groups = groupDiscoverBrowseRows([
      { title: "Lab A", discover_taxonomy: { key: "local-query-ready", group: 1, label: "In lab · Query ready" } },
      { title: "Ext B", discover_taxonomy: { key: "external-acquirable", group: 3, label: "External · Acquisition available" } },
      { title: "Lic C", discover_taxonomy: { key: "licensed-manual", group: 4, label: "Licensed / manual access" } },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.rows.map((r) => r.title)]),
      [
        ["lab", ["Lab A"]],
        ["external", ["Ext B"]],
        ["access", ["Lic C"]],
      ],
    );
  });
});
