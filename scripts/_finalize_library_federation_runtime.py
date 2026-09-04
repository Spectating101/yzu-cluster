from pathlib import Path


def patch(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing anchor for {label}: {path}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


patch(
    "drive/src/v2/LibraryFolderRailPanel.jsx",
    '''  const summaryLabel = providerDirectory\n    ? `${providerLabel} storage`''',
    '''  const summaryLabel = providerDirectory\n    ? providerRoot ? `${providerLabel} storage` : `${providerLabel} folder`''',
    "nested provider rail label",
)

patch(
    "e2e/library-federation-runtime.spec.js",
    '''  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Google Drive");\n  await page.screenshot({ path: `${OUT}/01-google-drive-root-1440.png`, fullPage: false });\n\n  await page.locator('button.row[data-kind="folder"]').filter({ hasText: "My Drive" }).click();''',
    '''  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Google Drive");\n  await page.screenshot({ path: `${OUT}/01-google-drive-root-1440.png`, fullPage: false });\n\n  const loadMore = page.getByRole("button", { name: "Load 50 more" });\n  await expect(loadMore).toBeVisible();\n  await loadMore.click();\n  await expect(page.getByText("Shared with me", { exact: true })).toBeVisible();\n  await expect(page.getByText("My Drive", { exact: true })).toBeVisible();\n  await expect(loadMore).toHaveCount(0);\n  await page.screenshot({ path: `${OUT}/01b-google-drive-root-after-cursor-1440.png`, fullPage: false });\n\n  await page.locator('button.row[data-kind="folder"]').filter({ hasText: "My Drive" }).click();''',
    "provider cursor proof",
)
