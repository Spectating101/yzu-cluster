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
print("Aligned Discover evidence tests to the single-authority center workspace and actionable CTAs")
