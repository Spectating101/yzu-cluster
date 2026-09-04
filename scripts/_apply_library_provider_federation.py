from pathlib import Path

page = Path('drive/src/v2/LibraryPage.jsx')
text = page.read_text()

old_import = 'import { isBrowsableLibraryLocation, libraryLocationStatusLabel, normalizeLibraryLocations } from "@/v2/libraryLocations";\n'
new_import = 'import { isBrowsableLibraryLocation, normalizeLibraryLocations } from "@/v2/libraryLocations";\n'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('LibraryPage location import missing')

segmented_control = '''              {browsingPhysicalFolders ? (\n                <div\n                  className="rd-v2-library-filter-control rd-v2-library-location-filter"\n                  data-testid="library-location-filter"\n                  aria-label="Folder storage location"\n                >\n                  <span>Location</span>\n                  <div className="rd-v2-library-location-options" role="group" aria-label="Browse folder storage location">\n                    {normalizedFolderLocations.map((location) => {\n                      const browsable = isBrowsableLibraryLocation(location, Boolean(onFolderLocationChange));\n                      const active = location.id === locationMode;\n                      const status = libraryLocationStatusLabel(location);\n                      return (\n                        <button\n                          key={location.id}\n                          type="button"\n                          className={active ? "active" : ""}\n                          data-location={location.id}\n                          data-state={location.state}\n                          aria-pressed={active}\n                          disabled={!browsable}\n                          title={location.id === "all" ? "Browse all available folder locations" : `${location.label} · ${status}`}\n                          onClick={() => {\n                            setLocationMode(location.id);\n                            onFolderLocationChange?.(location.id);\n                          }}\n                        >\n                          {location.label}\n                        </button>\n                      );\n                    })}\n                  </div>\n                </div>\n              ) : null}'''

dropdown_control = '''              {browsingPhysicalFolders ? (\n                <label\n                  className="rd-v2-library-filter-control rd-v2-library-location-filter"\n                  title="Choose which connected storage location to browse."\n                >\n                  <span>Location</span>\n                  <select\n                    data-testid="library-location-filter"\n                    aria-label="Browse folder storage location"\n                    value={locationMode}\n                    onChange={(event) => {\n                      const nextLocation = event.target.value;\n                      setLocationMode(nextLocation);\n                      onFolderLocationChange?.(nextLocation);\n                    }}\n                  >\n                    {normalizedFolderLocations.map((location) => {\n                      const browsable = isBrowsableLibraryLocation(location, Boolean(onFolderLocationChange));\n                      return (\n                        <option\n                          key={location.id}\n                          value={location.id}\n                          data-state={location.state}\n                          disabled={!browsable}\n                        >\n                          {location.label}\n                        </option>\n                      );\n                    })}\n                  </select>\n                </label>\n              ) : null}'''

if dropdown_control not in text:
    if segmented_control not in text:
        raise SystemExit('LibraryPage segmented location control missing')
    text = text.replace(segmented_control, dropdown_control, 1)

page.write_text(text)

css = Path('drive/src/v2/library-live-scale.css')
styles = css.read_text()
marker = '\n\n/* LIBRARY FEDERATION FREEZE: visible provider location chrome'
if marker in styles:
    styles = styles.split(marker, 1)[0].rstrip() + '\n'
styles += '''\n\n/* LIBRARY FEDERATION FREEZE: Location deliberately reuses the same compact\n   select pattern as Type, Readiness, and Sort. Provider capability remains in\n   the option list instead of becoming a second navigation strip. */\n'''
css.write_text(styles)

test_file = Path('e2e/library-location-disabled.spec.js')
test_file.write_text('''import { mkdirSync } from "node:fs";\nimport { test, expect } from "@playwright/test";\nimport { mockV2Api, waitForShell } from "./fixtures/v2MockApi.js";\n\nconst OUT = "artifacts/library-location-disabled";\n\ntest("Folders keeps disconnected external locations in the compact Location dropdown", async ({ page }) => {\n  mkdirSync(OUT, { recursive: true });\n  await page.setViewportSize({ width: 1440, height: 900 });\n  await mockV2Api(page);\n  await page.goto("/?tab=library", { waitUntil: "domcontentloaded" });\n  await waitForShell(page);\n  await page.getByTestId("library-folders-root").click();\n  await expect(page.getByTestId("library-directory")).toBeVisible();\n\n  const location = page.getByTestId("library-location-filter");\n  await expect(location).toBeVisible();\n  await expect(location).toHaveValue("all");\n  await expect(location.locator('option[value="all"]')).not.toHaveAttribute("disabled", "");\n\n  const drive = location.locator('option[value="google_drive"]');\n  const dropbox = location.locator('option[value="dropbox"]');\n  await expect(drive).toHaveAttribute("disabled", "");\n  await expect(dropbox).toHaveAttribute("disabled", "");\n  await expect(drive).toHaveAttribute("data-state", "disconnected");\n  await expect(dropbox).toHaveAttribute("data-state", "disconnected");\n  await expect(drive).toHaveText("Google Drive");\n  await expect(dropbox).toHaveText("Dropbox");\n  await expect(page.locator('.rd-v2-library-location-options')).toHaveCount(0);\n\n  await page.screenshot({ path: `${OUT}/01-folders-location-dropdown-1440.png`, fullPage: false });\n\n  await page.setViewportSize({ width: 390, height: 1000 });\n  await expect(location).toBeVisible();\n  await expect(location).toHaveValue("all");\n  await expect(drive).toHaveAttribute("disabled", "");\n  await expect(dropbox).toHaveAttribute("disabled", "");\n  await page.screenshot({ path: `${OUT}/02-folders-location-dropdown-mobile.png`, fullPage: false });\n});\n''')
