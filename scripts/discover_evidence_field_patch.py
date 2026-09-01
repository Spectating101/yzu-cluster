from pathlib import Path

path = Path("drive/src/v2/BrowsePage.jsx")
text = path.read_text()

old = 'import { DiscoverEvidenceCockpit, DiscoverResearchRadar } from "@/v2/DiscoverCockpit";\n'
new = old + 'import { DiscoverEvidenceField } from "@/v2/DiscoverEvidenceField";\n'
assert old in text and 'DiscoverEvidenceField' not in text, "evidence-field import anchor changed"
text = text.replace(old, new, 1)

old = '''            </section>\n\n            {centreRows.length ? (\n              <section className="rd-v2-discover-ranked-results" aria-label="Ranked Discover results" data-testid="discover-ranked-results">\n'''
new = '''            </section>\n\n            <DiscoverEvidenceField\n              query={q}\n              candidateCount={centreRows.length}\n              resultGroups={resultGroups}\n              assessmentActive={assessmentActive}\n              assessmentResult={assessmentResult}\n              onReviewAssembly={hasEvidenceGap ? () => setRouteComparisonOpen(true) : undefined}\n              onSearchWider={onSearchWeb}\n            />\n\n            {centreRows.length ? (\n              <section className="rd-v2-discover-ranked-results" aria-label="Ranked Discover results" data-testid="discover-ranked-results">\n'''
assert old in text, "evidence-field mount anchor changed"
text = text.replace(old, new, 1)

path.write_text(text)
