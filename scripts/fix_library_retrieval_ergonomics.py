from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


# Match backend semantics: an underscore schema identifier is one remembered
# object, not a bag of loosely related topic tokens.
replace_once(
    "drive/src/v2/librarySearch.js",
    '''function queryConcepts(query) {
  const tokens = normalize(query)
''',
    '''function queryConcepts(query) {
  const raw = String(query || "").trim().toLowerCase();
  if (raw.includes("_") && /^[a-z0-9_]+$/.test(raw)) {
    return [{ token: raw, variants: new Set([raw, normalize(raw)]) }];
  }

  const tokens = normalize(query)
''',
)

replace_once(
    "drive/src/v2/librarySearch.test.js",
    '''  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
  assert.ok(ranked[0].search_match.reasons.some((reason) => reason.kind === "structure"));
});
''',
    '''  assert.equal(ranked[0].dataset_id, "gdelt_asia_daily_country_panel");
  const structure = ranked[0].search_match.reasons.find((reason) => reason.kind === "structure");
  assert.equal(structure?.value, "country_iso3");
  assert.deepEqual(ranked[0].search_match.matched_terms, ["country_iso3"]);
});
''',
)

# The outside-estate surface was intentionally compressed from a large banner
# to a file-browser footer. Pin the possession boundary, not the removed copy.
replace_once(
    "e2e/v2-library.spec.js",
    '''    await expect(page.getByTestId("library-available-evidence")).toContainText("Available, not in your Library");
    await expect(page.getByTestId("library-available-evidence")).toContainText("1 additional catalogue record");
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Registered reference only");
    await expect(page.getByTestId("library-evidence-estate")).toContainText("No evidence matches the current Library view");
''',
    '''    const outside = page.getByTestId("library-available-evidence");
    await expect(outside).toContainText("1 known record");
    await expect(outside).toContainText("outside your Library");
    await expect(outside.getByRole("button", { name: "Review in Discover" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search library holdings" }).fill("Registered reference only");
    await expect(page.getByTestId("library-evidence-estate")).toContainText("No held evidence matches");
    await expect(page.getByRole("button", { name: "Search wider in Discover" })).toBeVisible();
''',
)
