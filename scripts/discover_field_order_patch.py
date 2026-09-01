from pathlib import Path

path = Path("drive/src/v2/BrowsePage.jsx")
text = path.read_text()

assessment = '''              {assessmentActive ? (\n                <DiscoverEvidenceBrief\n                  key={`assessment-workspace:${q}`}\n                  variant="workspace"\n                  initialQuestion={q}\n                  autoAssess\n                  assessmentValue={assessmentResult}\n                  catalog={catalog}\n                  onSelectRow={onSelectRow}\n                  onLegacySearch={onSuggestSearch}\n                  onCraftUrl={onCraftUrl}\n                  onAssessmentChange={onAssessmentChange}\n                  onAssessmentActive={onAssessmentActive}\n                  resourcesRollup={resourcesRollup}\n                  resourcesError={resourcesError}\n                  deskHealth={deskHealth}\n                />\n              ) : null}\n'''

field = '''            <DiscoverEvidenceField\n              query={q}\n              candidateCount={centreRows.length}\n              resultGroups={resultGroups}\n              assessmentActive={assessmentActive}\n              assessmentResult={assessmentResult}\n              onReviewAssembly={hasEvidenceGap ? () => setRouteComparisonOpen(true) : undefined}\n              onSearchWider={onSearchWeb}\n            />\n'''

assert text.count(assessment) == 1, "assessment workspace anchor changed"
assert text.count(field) == 1, "candidate field anchor changed"

# Keep the query composer / controls first. The candidate field then frames the
# evidence universe (including a synthesis path), and the detailed assessment
# follows as drill-down rather than obscuring that field on 1440px workstations.
text = text.replace(assessment, "", 1)
text = text.replace(field, field + "\n" + assessment.replace("              ", "            ", 1), 1)

path.write_text(text)
