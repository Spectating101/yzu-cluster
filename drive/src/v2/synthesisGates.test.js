import test from "node:test";
import assert from "node:assert/strict";
import { synthesisGates, threadWithMeasurements } from "./synthesisGates.js";

const objectiveGate = (thread) => synthesisGates(thread).find(([label]) => label === "Objective");

test("a title-only objective does not pass the objective check", () => {
  assert.deepEqual(objectiveGate({ title: "GDELT news shocks Asia", objective: "GDELT news shocks Asia", state: {} }), ["Objective", "Title only", false]);
  assert.deepEqual(objectiveGate({ title: "Weekly crypto panel", objective: "Build a weekly crypto panel to test de-peg volatility", state: {} }), ["Objective", "Recorded", true]);
  assert.deepEqual(objectiveGate({ title: "", state: {} }), ["Objective", "Missing", false]);
});

test("measurements feed the measurement, units and join checks", () => {
  const thread = { title: "T", objective: "Build a panel for a study", state: { status: "exploring", nodes: [{ layer: "evidence" }] } };
  const measured = threadWithMeasurements(thread, { column_profiles: [{ name: "a" }], unit_conflict: { a: 1 }, measured_inputs: 1 });
  const gates = Object.fromEntries(synthesisGates(measured).map(([label, value, ok]) => [label, [value, ok]]));
  assert.deepEqual(gates.Measurement, ["1 profiled", true]);
  assert.deepEqual(gates.Units, ["Decision needed", false]);
});
