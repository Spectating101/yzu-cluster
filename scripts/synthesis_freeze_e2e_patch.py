from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count == 0 and new in text:
        print(f"already patched: {path}")
        return
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "e2e/v2-synthesis.spec.js"

replace_once(path,
'''    const evidence = page.getByTestId("synthesis-evidence-state");
    const next = page.getByLabel("What happens next");
    const findHeldEvidence = next.getByRole("button", { name: "Find held evidence" });
    await expect(findHeldEvidence).toBeVisible();
    const findBox = await findHeldEvidence.boundingBox();
    expect(findBox?.y || Infinity).toBeLessThan(900);
    await capture(page, "workflow-find-held-1440x1000");
    await page.setViewportSize({ width: 390, height: 844 });
    const hideRail = page.getByRole("button", { name: "Hide panel" });
    if (await hideRail.isVisible().catch(() => false)) await hideRail.click();
    await next.scrollIntoViewIfNeeded();
    await capture(page, "workflow-find-held-390x844");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await findHeldEvidence.click();

    const proposal = page.getByTestId("synthesis-evidence-proposal");''',
'''    const evidence = page.getByTestId("synthesis-evidence-state");
    const next = page.getByLabel("What happens next");
    await expect(next.getByRole("button", { name: "Find held evidence" })).toHaveCount(0);

    // Discovery of already-held Library evidence is read-only and automatic.
    // The durable map must remain unchanged until the researcher explicitly
    // selects and adds an input.
    const proposal = page.getByTestId("synthesis-evidence-proposal");''')

replace_once(path,
'''    // The result is below the opening fold. An explicit search should reveal
    // its review result rather than leaving the successful request invisible.
    await expect(proposal).toBeInViewport();
    await expect(evidence).toContainText("No inputs mapped");
    await capture(page, "02b-held-evidence-review-desktop");''',
'''    await expect(proposal).toBeInViewport();
    await expect(evidence).toContainText("No inputs mapped");
    await capture(page, "02b-held-evidence-review-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    const hideRail = page.getByRole("button", { name: "Hide panel" });
    if (await hideRail.isVisible().catch(() => false)) await hideRail.click();
    await proposal.scrollIntoViewIfNeeded();
    await capture(page, "workflow-held-review-390x844");
    await page.setViewportSize({ width: 1440, height: 1000 });''')

replace_once(path,
'''    await expect(next).toContainText("Review checkpoint");
    await expect(next).toContainText("nothing has run");
    await expect(next.getByRole("button", { name: "Review proposal" })).toBeEnabled();''',
'''    await expect(next).toContainText("Review checkpoint");
    await expect(next).toContainText("nothing has run");
    await expect(next.getByRole("button", { name: "Review proposal" })).toHaveCount(0);''')

replace_once(path,
'''    await capture(page, "02-proposal-review-desktop");
    await page.getByRole("button", { name: "Accept proposal" }).click();
    const execution = page.getByTestId("synthesis-execution-state");
    await expect(execution).toContainText("stablecoin_attention_weekly");
    await expect(execution).toContainText("Bounded preview required");
    await execution.getByRole("button", { name: "Run bounded preview" }).click();
    await expect(execution).toContainText("Bounded preview passed");
    await expect(execution.getByRole("button", { name: "Request execution approval" })).toBeVisible();
    await execution.getByRole("button", { name: "Request execution approval" }).click();
    const pending = page.getByTestId("synthesis-execution-state");
    await expect(pending).toContainText("pending approval");
    await expect(pending.getByRole("button", { name: "Review approval" })).toBeVisible();
    await expect(pending.getByRole("button", { name: "Request execution approval" })).toHaveCount(0);
    await expect(pending).toContainText("Researcher approval");
    await expect(pending).toContainText("Archive + registry");
    await expect(pending.getByText("Query ready", { exact: true })).toHaveCount(0);
    await capture(page, "03-execution-request-desktop");
    await pending.getByRole("button", { name: "Review approval" }).click();
    await expect(page).toHaveURL(/tab=discover/);
    await expect(page).toHaveURL(/mode=history/);''',
'''    await capture(page, "02-proposal-review-desktop");
    await page.getByRole("button", { name: "Accept & test method" }).click();
    const execution = page.getByTestId("synthesis-execution-state");
    await expect(execution).toContainText("stablecoin_attention_weekly");
    await expect(execution).toContainText("Bounded preview passed");
    await expect(execution.getByRole("button", { name: "Run bounded test" })).toHaveCount(0);
    await expect(execution.getByRole("button", { name: "Review execution approval" })).toBeVisible();
    await capture(page, "03-preview-passed-desktop");

    // One action creates/reuses the pending approval and opens its durable
    // researcher review record. It still does not approve worker execution.
    await execution.getByRole("button", { name: "Review execution approval" }).click();
    await expect(page).toHaveURL(/tab=discover/);
    await expect(page).toHaveURL(/mode=history/);''')

replace_once(path,
'''    // First load shows no execution yet, so "Request execution" renders.
      // From the second GET onward (the idempotency guard's own pre-flight
      // refetch, triggered by the click below) the durable job already
      // exists — simulating that the first attempt's response was lost
      // even though the server had already created it.''',
'''      // First load shows an accepted method with a current bounded test.
      // From the second GET onward (the idempotency guard's own pre-flight
      // refetch, triggered by the review click below) the durable approval
      // already exists — simulating a lost response without creating a duplicate.''')

replace_once(path,
'''    await expect(execution).toContainText("stablecoin_attention_weekly");
    await expect(execution.getByRole("button", { name: "Request execution approval" })).toBeVisible();

    await execution.getByRole("button", { name: "Request execution approval" }).click();

    await expect(execution.getByRole("button", { name: "Review approval" })).toBeVisible();
    await expect(execution.getByRole("button", { name: "Request execution approval" })).toHaveCount(0);
    expect(executeCalls).toBe(0);
    expect(getCalls).toBeGreaterThanOrEqual(2);''',
'''    await expect(execution).toContainText("stablecoin_attention_weekly");
    await expect(execution.getByRole("button", { name: "Review execution approval" })).toBeVisible();

    await execution.getByRole("button", { name: "Review execution approval" }).click();

    await expect(page).toHaveURL(/tab=discover/);
    await expect(page).toHaveURL(/mode=history/);
    expect(executeCalls).toBe(0);
    expect(getCalls).toBeGreaterThanOrEqual(2);''')

print("Synthesis freeze e2e contract patch applied cleanly.")
