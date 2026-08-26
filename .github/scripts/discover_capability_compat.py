from pathlib import Path

path = Path("e2e/v2-discover-evidence.spec.js")
text = path.read_text(encoding="utf-8")
old = '''    const result = page.getByTestId("discover-assessment-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Evidence position");'''
new = '''    const result = page.locator(".rd-v2-evidence-brief.is-workspace").getByTestId("discover-assessment-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Evidence position");'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one center-assessment selector seam, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Scoped evidence edit assertions to the center assessment authority")
