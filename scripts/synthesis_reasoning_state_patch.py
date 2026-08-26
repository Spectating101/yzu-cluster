from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


page = "drive/src/v2/SynthesisPage.jsx"
test = "e2e/v2-synthesis.spec.js"

replace_once(
    page,
    '''function stageLabel(thread) {
  return synthesisAssist(thread).label;
}''',
    '''function reasoningTurnResolved(thread) {
  const mode = stateFor(thread);
  return ["proposal", "execution", "registered", "query_ready", "failed"].includes(mode);
}

function stageLabel(thread) {
  return synthesisAssist(thread).label;
}''',
    "reasoning resolution helper",
)
replace_once(
    page,
    '      const stillInterpreting = next ? stateFor(next) === "draft" : interpreting;',
    '      const stillInterpreting = next ? !reasoningTurnResolved(next) : interpreting;',
    "polling resolution predicate",
)
replace_once(
    page,
    '''  useEffect(() => {
    if (!selected || stateFor(selected) === "draft") return;
    setReasoningThreadId((current) => (current === selected.id ? "" : current));
  }, [selected]);''',
    '''  useEffect(() => {
    if (!selected || !reasoningPending || !reasoningTurnResolved(selected)) return;
    setReasoningThreadId((current) => (current === selected.id ? "" : current));
    setInterpretingStalled(false);
  }, [reasoningPending, selected]);''',
    "reasoning pending clear predicate",
)

p = Path(test)
text = p.read_text(encoding="utf-8")
start_marker = '  test("creates a durable thread before handing the objective to Ask"'
end_marker = '  test("routes a backend-declared evidence gap to Discover, then returns to the exact thread with evidence intact"'
start = text.find(start_marker)
end = text.find(end_marker, start + 1)
if start < 0 or end < 0:
    raise SystemExit("stale reasoning lifecycle test block markers not found")

replacement = r'''  test("creates a durable thread quietly, then hands mapped evidence to Ask only on explicit reasoning", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    await expect(page.locator(".s04-intent-contract")).toHaveCount(0);
    await expect(page.getByText("No method exists yet.")).toBeVisible();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Synthesis studio");
    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await capture(page, "06-new-project-entry-desktop");

    const objective = "Construct a weekly issuer attention panel for Taiwan filings.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(objective);
    await page.getByRole("button", { name: "Create construction" }).click();
    await expect(page.getByRole("region", { name: "Research brief" }).getByRole("paragraph")).toHaveText(objective);
    await expect(page.getByRole("heading", { name: "Weekly issuer attention panel for Taiwan filings" })).toBeVisible();
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);
    await expect(page.getByText("Grounded answer", { exact: true })).toHaveCount(0);

    const evidenceProposal = page.getByTestId("synthesis-evidence-proposal");
    await expect(evidenceProposal).toContainText("Indonesia daily cross-section");
    await evidenceProposal.getByRole("checkbox", { name: /Indonesia daily cross-section/ }).check();
    await evidenceProposal.getByRole("button", { name: "Add 1 selected input" }).click();

    const next = page.getByLabel("What happens next");
    const startReasoning = next.getByRole("button", { name: "Start method reasoning" });
    await expect(startReasoning).toBeEnabled();
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);
    await startReasoning.click();

    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();
    await expect(next.getByRole("button", { name: "Method reasoning in Ask" })).toBeDisabled();
    await expect(page.locator("aside.rd-v2-rail")).toContainText("Ask · synthesis thread");
    await expect(page.locator("aside.rd-v2-rail")).not.toContainText("Interpret this research objective");
    await expect(page.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    await capture(page, "07-explicit-method-reasoning-desktop");
  });

  test("the reasoning canvas yields to proposal review once the explicit agent turn lands, without a manual reload", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    const objective = "Construct a weekly issuer attention panel for Taiwan filings.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(objective);

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/library/synthesis/threads") && res.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Create construction" }).click(),
    ]);
    const created = await createResponse.json();
    const threadId = created.id;

    const evidenceProposal = page.getByTestId("synthesis-evidence-proposal");
    await evidenceProposal.getByRole("checkbox", { name: /Indonesia daily cross-section/ }).check();
    await evidenceProposal.getByRole("button", { name: "Add 1 selected input" }).click();
    const startReasoning = page.getByLabel("What happens next").getByRole("button", { name: "Start method reasoning" });
    await expect(startReasoning).toBeEnabled();
    await startReasoning.click();
    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();

    await page.route(`**/library/synthesis/threads/${threadId}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...created,
          id: threadId,
          title: objective,
          objective,
          updated_at: "2026-07-19T09:01:00+00:00",
          state: {
            ...(created.state || {}),
            title: objective,
            objective,
            nodes: [structuredClone(EVIDENCE_MAP_NODE)],
            proposal: structuredClone(PROPOSAL_THREAD.state.proposal),
            maturity: "proposal",
            maturityLabel: "Proposal needs review",
            lastActivity: "A review-only proposal was recorded.",
          },
        }),
      });
    });

    await expect(page.getByTestId("synthesis-proposal-state")).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);
  });

  test("stops polling explicitly requested reasoning and admits a stall, then recovers on retry", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill("Unresolved objective for stall coverage.");
    await page.getByRole("button", { name: "Create construction" }).click();

    const evidenceProposal = page.getByTestId("synthesis-evidence-proposal");
    await evidenceProposal.getByRole("checkbox", { name: /Indonesia daily cross-section/ }).check();
    await evidenceProposal.getByRole("button", { name: "Add 1 selected input" }).click();

    await page.clock.install();
    const startReasoning = page.getByLabel("What happens next").getByRole("button", { name: "Start method reasoning" });
    await expect(startReasoning).toBeEnabled();
    await startReasoning.click();

    const card = page.getByTestId("synthesis-draft-state");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
    await expect(card).toContainText("Interpretation in progress");

    await page.clock.fastForward(65000);

    await expect(card).toContainText("Taking longer than expected");
    await expect(card).toContainText("The agent hasn't responded yet");
    const retry = card.getByTestId("synthesis-draft-retry");
    await expect(retry).toBeVisible();

    await retry.click();
    await expect(card).toContainText("Interpretation in progress");
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
  });

  test("a stalled explicit reasoning turn does not make the next new thread look stalled", async ({ page }) => {
    await page.getByRole("button", { name: "+ New" }).click();
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill("First unresolved objective.");
    await page.getByRole("button", { name: "Create construction" }).click();
    let evidenceProposal = page.getByTestId("synthesis-evidence-proposal");
    await evidenceProposal.getByRole("checkbox", { name: /Indonesia daily cross-section/ }).check();
    await evidenceProposal.getByRole("button", { name: "Add 1 selected input" }).click();

    await page.clock.install();
    let startReasoning = page.getByLabel("What happens next").getByRole("button", { name: "Start method reasoning" });
    await startReasoning.click();
    await expect(page.getByTestId("synthesis-draft-state")).toBeVisible();
    await page.clock.fastForward(65000);
    await expect(page.getByTestId("synthesis-draft-state")).toContainText("Taking longer than expected");

    await page.getByRole("button", { name: "+ New" }).click();
    const secondObjective = "Second unresolved objective.";
    await page.getByTestId("synthesis-intent-state").getByRole("textbox").fill(secondObjective);
    await page.getByRole("button", { name: "Create construction" }).click();
    await expect(page.getByTestId("synthesis-draft-state")).toHaveCount(0);

    evidenceProposal = page.getByTestId("synthesis-evidence-proposal");
    await evidenceProposal.getByRole("checkbox", { name: /Indonesia daily cross-section/ }).check();
    await evidenceProposal.getByRole("button", { name: "Add 1 selected input" }).click();
    startReasoning = page.getByLabel("What happens next").getByRole("button", { name: "Start method reasoning" });
    await expect(startReasoning).toBeEnabled();
    await startReasoning.click();

    const card = page.getByTestId("synthesis-draft-state");
    await expect(card).toContainText("Interpretation in progress");
    await expect(card.getByTestId("synthesis-draft-retry")).toHaveCount(0);
  });

'''

p.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
