from pathlib import Path

path = Path("e2e/v2-discover-evidence.spec.js")
text = path.read_text(encoding="utf-8")


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    '    const result = page.getByTestId("discover-assessment-result");\n',
    '    const result = page.locator(".rd-v2-evidence-brief.is-workspace").getByTestId("discover-assessment-result");\n',
    "center assessment locator",
)
replace_once(
    '    await expect(result).toBeVisible();\n    await expect(page.getByTestId("discover-verdict")).toHaveText("Partially covered");',
    '    await expect(result).toBeVisible();\n    await expect(page.getByTestId("discover-query-composer")).toHaveCount(1);\n    await expect(page.getByLabel("Explore question")).toHaveCount(0);\n    await expect(page.getByTestId("discover-interpreting")).toHaveCount(0);\n    await expect(page.getByTestId("discover-verdict")).toHaveText("Partially covered");',
    "single entrance and authority assertions",
)
replace_once(
    '    await expect(page.getByRole("button", { name: "Strategy needs context" })).toBeVisible();',
    '    await expect(page.getByRole("button", { name: "Clarify evidence need" })).toBeVisible();',
    "context CTA label",
)
replace_once(
    '    await page.getByRole("button", { name: "Custom strategy ready" }).click();',
    '    await page.getByRole("button", { name: "Review sourcing strategy" }).click();',
    "sourcing CTA label",
)
replace_once(
    '''    const briefBox = await page.getByTestId("discover-interpreting").boundingBox();
    const filterBox = await page.getByTestId("discover-filter-menu").boundingBox();
    expect(briefBox).not.toBeNull();
    expect(filterBox).not.toBeNull();
    expect(filterBox.y).toBeGreaterThanOrEqual(briefBox.y + briefBox.height - 1);''',
    '''    const filterBox = await page.getByTestId("discover-filter-menu").boundingBox();
    const workspaceBox = await page.locator(".rd-v2-evidence-brief.is-workspace").boundingBox();
    expect(filterBox).not.toBeNull();
    expect(workspaceBox).not.toBeNull();
    expect(workspaceBox.y).toBeGreaterThanOrEqual(filterBox.y + filterBox.height - 1);''',
    "mobile authoritative workspace geometry",
)

path.write_text(text, encoding="utf-8")

# The idle visual gate should defend the research sequence, not historical copy.
# The candidate deliberately upgrades the path to start from the evidence need,
# then establish Library position, then source only the unresolved gap, then
# require reviewed acquisition. Keep all four semantics explicit and ordered.
visual_path = Path("e2e/discover-visual-convergence.spec.js")
visual = visual_path.read_text(encoding="utf-8")
old = '''    await expect(page.getByText("Library first", { exact: true })).toBeVisible();
    await expect(page.getByText("Reviewed acquisition", { exact: true })).toBeVisible();

    const path = coverage.locator(".rd-v2-discover-evidence-path");'''
new = '''    const path = coverage.locator(".rd-v2-discover-evidence-path");
    const stages = path.locator("li");
    await expect(stages).toHaveCount(4);
    await expect(stages.nth(0)).toContainText("Evidence need");
    await expect(stages.nth(0)).toContainText("reviewable evidence contract");
    await expect(stages.nth(1)).toContainText("Library position");
    await expect(stages.nth(1)).toContainText("before new acquisition");
    await expect(stages.nth(2)).toContainText("Sourcing strategy");
    await expect(stages.nth(2)).toContainText("unresolved evidence gaps");
    await expect(stages.nth(3)).toContainText("Reviewed acquisition");
    await expect(stages.nth(3)).toContainText("approval before collection");'''
count = visual.count(old)
if count != 1:
    raise SystemExit(f"idle evidence path semantic gate: expected one match, found {count}")
visual_path.write_text(visual.replace(old, new, 1), encoding="utf-8")

print("Aligned Discover evidence tests and bound idle visual acceptance to the four-stage research semantics")
