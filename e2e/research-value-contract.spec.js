import { test, expect } from "@playwright/test";
import {
  facultyStateLabel,
  namedAction,
} from "../drive/src/v2/researchValue.js";
import {
  constructionComposerContext,
  normalizeResearchConstruction,
} from "../drive/src/v2/ResearchConstructionViewModel.js";

const THREAD = {
  id: "construction-ownership",
  title: "Ownership regimes and estimate revisions",
  objective: "Do ownership regimes predict analyst estimate revisions?",
  updated_at: "2026-07-23T09:00:00Z",
  state: {
    required_grain: "firm × month",
    population: "Indonesia listed firms",
    period: "2015–2025",
    nodes: [
      { id: "prices", layer: "evidence", type: "construct", label: "Daily market response", status: "held", grain: "firm-day", coverage: "2015–2025" },
      { id: "estimates", layer: "evidence", type: "construct", label: "Analyst estimate revisions", status: "query_ready", grain: "firm-month", coverage: "2015–2025" },
      { id: "ownership", layer: "evidence", type: "source", label: "Ownership-change history", status: "needs_access", grain: "firm-month", coverage: "2015–2025" },
    ],
    proposal: null,
    execution_spec: null,
    execution: null,
  },
};

test.describe("research-value authority contract", () => {
  test("maps only explicit approval state to a human decision", () => {
    expect(facultyStateLabel("pending_approval")).toBe("Waiting for your decision");
    expect(facultyStateLabel("pending")).toBe("Pending state; decision authority not established");
  });

  test("keeps assignment, execution, preservation, registration, and analysis distinct", () => {
    expect(facultyStateLabel("claimed")).toBe("Assigned to a collection worker");
    expect(facultyStateLabel("running")).toBe("Collection in progress");
    expect(facultyStateLabel("archive_verified")).toBe("Evidence preserved");
    expect(facultyStateLabel("registered")).toBe("Indexed in the research estate");
    expect(facultyStateLabel("query_ready")).toBe("Ready for analysis");
    expect(facultyStateLabel("registered")).not.toBe(facultyStateLabel("query_ready"));
  });

  test("does not cosmetically establish unknown backend states", () => {
    expect(facultyStateLabel("mysterious_state")).toContain("State not yet established");
    expect(facultyStateLabel("unknown")).toBe("State not established");
  });

  test("rejects empty or generic named actions", () => {
    expect(namedAction("", "construction")).toBe("Action unavailable");
    expect(namedAction("Open", "")).toBe("Action unavailable");
    expect(namedAction("Inspect", "evidence asset")).toBe("Inspect evidence asset");
  });

  test("normalizes one construction and its canonical relationships", () => {
    const view = normalizeResearchConstruction(THREAD);
    expect(view.question).toBe("Do ownership regimes predict analyst estimate revisions?");
    expect(view.unitOfAnalysis).toBe("firm × month");
    expect(view.evidenceHeld.map((item) => item.label)).toEqual([
      "Daily market response",
      "Analyst estimate revisions",
    ]);
    expect(view.evidenceMissing.map((item) => item.label)).toEqual(["Ownership-change history"]);
    expect(view.relationships.holds).toEqual(["prices", "estimates"]);
    expect(view.relationships.requires).toEqual(["ownership"]);
    expect(view.nextDecision.type).toBe("evidence_gap");
  });

  test("binds Composer to one construction and selected field", () => {
    const view = normalizeResearchConstruction(THREAD);
    const context = constructionComposerContext(view, "method");
    expect(context).toContain("construction_id: construction-ownership");
    expect(context).toContain("selected_field: method");
    expect(context).toContain("evidence_missing: Ownership-change history");
  });
});
