import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.jsx"),
  "utf8",
);

test("an authenticated open desk keeps assistant runtime truth current", () => {
  assert.match(source, /DESK_HEALTH_READY_POLL_MS\s*=\s*60_000/);
  assert.match(source, /DESK_HEALTH_RECHECK_MS\s*=\s*10_000/);
  assert.match(source, /deskHealth\(false, \{ timeoutMs: 12_000 \}\)/);
  assert.match(source, /composerRuntime\?\.ready\s*\?\s*DESK_HEALTH_READY_POLL_MS\s*:\s*DESK_HEALTH_RECHECK_MS/);
  assert.match(source, /window\.clearInterval\(handle\)/);
  assert.match(source, /document\.visibilityState === "visible"/);
});
