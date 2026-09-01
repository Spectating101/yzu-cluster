from pathlib import Path

path = Path("drive/src/v2/BrowsePage.jsx")
text = path.read_text()

field = '''            <DiscoverEvidenceField\n              query={q}\n              candidateCount={centreRows.length}\n              resultGroups={resultGroups}\n              assessmentActive={assessmentActive}\n              assessmentResult={assessmentResult}\n              onReviewAssembly={hasEvidenceGap ? () => setRouteComparisonOpen(true) : undefined}\n              onSearchWider={onSearchWeb}\n            />\n\n'''

assessment = '''            {assessmentActive ? (\n                <DiscoverEvidenceBrief\n                  key={`assessment-workspace:${q}`}\n                  variant="workspace"\n                  initialQuestion={q}\n                  autoAssess\n                  assessmentValue={assessmentResult}\n                  catalog={catalog}\n                  onSelectRow={onSelectRow}\n                  onLegacySearch={onSuggestSearch}\n                  onCraftUrl={onCraftUrl}\n                  onAssessmentChange={onAssessmentChange}\n                  onAssessmentActive={onAssessmentActive}\n                  resourcesRollup={resourcesRollup}\n                  resourcesError={resourcesError}\n                  deskHealth={deskHealth}\n                />\n              ) : null}\n\n'''

needle = '''              </div>\n            </section>\n\n''' + field + assessment
replacement = '''              </div>\n\n''' + field.replace("            ", "              ", 1) + assessment.replace("            ", "              ", 1) + '''            </section>\n\n'''

assert needle in text, "investigation flow anchor changed"
text = text.replace(needle, replacement, 1)
path.write_text(text)
