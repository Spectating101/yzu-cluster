from pathlib import Path

path = Path("e2e/library-convergence-render.spec.js")
text = path.read_text(encoding="utf-8")

old_root = '''  await setup(page, { width: 1440, height: 900 });
  await expect(page.getByTestId("library-auto-catalog")).toContainText("View");
  await expect(page.getByTestId("library-available-evidence")).toContainText("1 additional catalogue record");
  await expect(page.getByTestId("library-available-evidence")).toContainText("not held in this Library");

  await page.getByTestId("library-auto-view-literature").click();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(1);
  await expect(page.getByTestId("library-evidence-row")).toContainText("Stablecoin governance evidence review");
  await expect(page.getByTestId("library-evidence-row")).not.toContainText("Asia daily news-risk panel");
  await page.getByTestId("library-auto-view-all").click();
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(5);
'''
new_root = '''  await setup(page, { width: 1440, height: 900 });
  await expect(page.getByTestId("library-auto-catalog")).toHaveCount(0);
  await expect(page.getByTestId("library-type-filter")).toHaveValue("all");
  await expect(page.getByTestId("library-state-filter")).toHaveValue("all");
  await expect(page.getByTestId("library-sort-filter")).toHaveValue("name");
  const outside = page.getByTestId("library-available-evidence");
  await expect(outside).toContainText("1 known record");
  await expect(outside).toContainText("outside your Library");
  await expect(outside.getByRole("button", { name: "Review in Discover" })).toBeVisible();

  await page.getByTestId("library-type-filter").selectOption("literature");
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(1);
  await expect(page.getByTestId("library-evidence-row")).toContainText("Stablecoin governance evidence review");
  await expect(page.getByTestId("library-evidence-row")).not.toContainText("Asia daily news-risk panel");
  await page.getByTestId("library-type-filter").selectOption("all");
  await expect(page.getByTestId("library-evidence-row")).toHaveCount(5);
'''

old_state = '''  await page.getByRole("button", { name: /^Not query-ready / }).click();
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "MOPS financial statements" })).toBeVisible();
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" })).toHaveCount(0);
  await page.getByRole("button", { name: /^All$/ }).click();
'''
new_state = '''  await page.getByTestId("library-state-filter").selectOption("not_ready");
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "MOPS financial statements" })).toBeVisible();
  await expect(page.getByTestId("library-evidence-row").filter({ hasText: "Asia daily news-risk panel" })).toHaveCount(0);
  await page.getByTestId("library-state-filter").selectOption("all");
'''

for old, new in ((old_root, new_root), (old_state, new_state)):
    if old not in text:
        raise SystemExit(f"expected convergence contract not found: {old[:120]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
