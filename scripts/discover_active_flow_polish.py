from pathlib import Path

brief_path = Path("drive/src/v2/DiscoverEvidenceBrief.jsx")
brief = brief_path.read_text()

open_anchor = '''          {(variant === "layered" || variant === "workspace") ? (\n'''
assert brief.count(open_anchor) == 1, "assessment detail start anchor changed"
open_block = '''          <details\n            className={`rd-v2-evidence-detail-disclosure${variant === "workspace" ? " is-workspace" : ""}`}\n            open={variant === "workspace" ? undefined : true}\n          >\n            <summary>\n              <span>Assessment details</span>\n              <em>\n                {heldEvidence.length} held · {assessment.gap ? "1 gap" : "no gap"} · {routeLoading\n                  ? "checking routes"\n                  : `${routeRows.length} declared route${routeRows.length === 1 ? "" : "s"}`}\n              </em>\n            </summary>\n'''
brief = brief.replace(open_anchor, open_block + open_anchor, 1)

close_anchor = '''          {assessment.assessment_basis ? (\n            <details className="rd-v2-evidence-basis-details">\n              <summary>Assessment basis</summary>\n              <p className="rd-v2-evidence-basis">{assessmentBasisSummary(assessment.assessment_basis)}</p>\n            </details>\n          ) : null}\n        </div>\n'''
assert brief.count(close_anchor) == 1, "assessment detail end anchor changed"
brief = brief.replace(
    close_anchor,
    close_anchor.replace('        </div>\n', '          </details>\n        </div>\n'),
    1,
)
brief_path.write_text(brief)

css_path = Path("drive/src/v2/discover-efficiency-polish.css")
css = css_path.read_text()
css_append = r'''

/* Active-flow hierarchy pass after 1440/1920 pixel review. The evidence field
   stays primary; deep assessment becomes a deliberate drill-down. */
.rd-v2-evidence-detail-disclosure {
  min-width: 0;
}

.rd-v2-evidence-detail-disclosure:not(.is-workspace) > summary {
  display: none;
}

.rd-v2-evidence-detail-disclosure.is-workspace {
  margin-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 62%, transparent);
}

.rd-v2-evidence-detail-disclosure.is-workspace > summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 2px 2px;
  color: var(--rd-body, #3e4759);
  cursor: pointer;
  list-style: none;
  font-size: 9.5px;
  font-weight: 700;
}

.rd-v2-evidence-detail-disclosure.is-workspace > summary::-webkit-details-marker {
  display: none;
}

.rd-v2-evidence-detail-disclosure.is-workspace > summary::before {
  content: "▸";
  flex: 0 0 auto;
  margin-right: -5px;
  color: var(--rd-muted, #6e7685);
  font-size: 8px;
}

.rd-v2-evidence-detail-disclosure.is-workspace[open] > summary::before {
  content: "▾";
}

.rd-v2-evidence-detail-disclosure.is-workspace > summary em {
  margin-left: auto;
  color: var(--rd-muted, #6e7685);
  font-size: 8.5px;
  font-style: normal;
  font-weight: 500;
}

.rd-v2-evidence-detail-disclosure.is-workspace[open] > summary {
  margin-bottom: 6px;
  padding-bottom: 7px;
  border-bottom: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 52%, transparent);
}

/* Remove the dead band between the field framing and the result ledger. */
.rd-v2-discover-field + .rd-v2-discover-ranked-results,
.rd-v2-discover-explore-workspace + .rd-v2-discover-ranked-results {
  margin-top: 0 !important;
}

.rd-v2-discover-ranked-results {
  margin-top: 0 !important;
  padding-top: 0;
}

.rd-v2-discover-ranked-results-head {
  min-height: 28px;
  padding: 6px 0 5px;
}

/* The idle inspector need not reserve selected-candidate width. Restore canvas
   space while keeping enough room for the search summary; expand only on focus. */
@media (min-width: 1501px) {
  body:has(.rd-v2-discover-page [data-testid="discover-result-summary"]):not(:has(.rd-v2-discover-candidate.selected)) .rd-v2-shell {
    --rd-rail: 336px;
  }
  body:has(.rd-v2-discover-page .rd-v2-discover-candidate.selected) .rd-v2-shell {
    --rd-rail: 400px;
  }
}

@media (min-width: 1100px) and (max-width: 1500px) {
  body:has(.rd-v2-discover-page [data-testid="discover-result-summary"]):not(:has(.rd-v2-discover-candidate.selected)) .rd-v2-shell {
    --rd-rail: 312px;
  }
  body:has(.rd-v2-discover-page .rd-v2-discover-candidate.selected) .rd-v2-shell {
    --rd-rail: 356px;
  }

  .rd-v2-discover-browse:has(> .rd-v2-discover-evidence-cockpit) {
    grid-template-columns: 150px minmax(0, 1fr);
    column-gap: 8px;
  }
}
'''
marker = "/* Active-flow hierarchy pass after 1440/1920 pixel review."
assert marker not in css, "active-flow polish already applied"
css_path.write_text(css.rstrip() + css_append + "\n")

spec_path = Path("e2e/discover-reconvergence-visual.spec.js")
spec = spec_path.read_text()

large_anchor = '''      await runSearch(page);\n      await assertNoOverflow(page);\n      await page.screenshot({ path: `${OUT}/discover-results-${viewport.name}.png`, fullPage: false });\n'''
assert spec.count(large_anchor) == 1, "large field assertion anchor changed"
large_replacement = '''      await runSearch(page);\n      const fieldBox = await page.getByTestId("discover-evidence-field").boundingBox();\n      const resultsBox = await page.getByTestId("discover-ranked-results").boundingBox();\n      expect(fieldBox).not.toBeNull();\n      expect(resultsBox).not.toBeNull();\n      expect(resultsBox.y - (fieldBox.y + fieldBox.height)).toBeLessThan(38);\n      await assertNoOverflow(page);\n      await page.screenshot({ path: `${OUT}/discover-results-${viewport.name}.png`, fullPage: false });\n'''
spec = spec.replace(large_anchor, large_replacement, 1)

invest_anchor = '''      await expect(page.getByTestId("discover-assembly-path")).toBeVisible();\n      await expect(page.getByTestId("discover-assembly-path")).toContainText(/No single source has to be the answer/i);\n      await assertNoOverflow(page);\n'''
assert spec.count(invest_anchor) == 1, "investigation assertion anchor changed"
invest_replacement = '''      await expect(page.getByTestId("discover-assembly-path")).toBeVisible();\n      await expect(page.getByTestId("discover-assembly-path")).toContainText(/No single source has to be the answer/i);\n      const details = workspace.locator(".rd-v2-evidence-detail-disclosure.is-workspace");\n      await expect(details).toBeVisible();\n      expect(await details.evaluate((node) => node.open)).toBe(false);\n      const firstCandidateBox = await page.getByTestId("discover-ranked-results").locator(".rd-v2-discover-candidate").first().boundingBox();\n      expect(firstCandidateBox).not.toBeNull();\n      expect(firstCandidateBox.y).toBeLessThan(viewport.height);\n      await assertNoOverflow(page);\n'''
spec = spec.replace(invest_anchor, invest_replacement, 1)
spec_path.write_text(spec)
