from pathlib import Path

path = Path("drive/src/v2/BrowsePage.jsx")
text = path.read_text()

old = 'import { DiscoverCoveragePanel } from "@/v2/DiscoverCoveragePanel";\n'
new = old + 'import { DiscoverEvidenceCockpit, DiscoverResearchRadar } from "@/v2/DiscoverCockpit";\n'
assert old in text, "cockpit import anchor changed"
text = text.replace(old, new, 1)

old = '''      <p>\n        Keywords return fast results. A research question also starts a contextual Ask investigation automatically.\n      </p>\n'''
new = old + '''      <div className="rd-v2-discover-composer-scope" aria-label="Discover search universe">\n        <span>Library index</span>\n        <span>Source catalogues</span>\n        <span>Open web context</span>\n        <span>URL / DOI inspection</span>\n        <span>Approval-gated acquisition</span>\n      </div>\n'''
assert old in text, "composer scope anchor changed"
text = text.replace(old, new, 1)

old = '      lead="Search your Library first, then evaluate sources beyond it"\n'
new = '      lead="Find, compare, verify, and acquire research evidence"\n'
assert old in text, "Discover lead anchor changed"
text = text.replace(old, new, 1)

old = '''            <DiscoverQueryComposer\n              value={queryDraft}\n              onValueChange={setQueryDraft}\n              onSearch={onSuggestSearch}\n              onAsk={(question) => onAskQuery?.(question, { kind: "investigation" })}\n              onAssess={onOpenAssessment}\n              idle\n            />\n            <div className="rd-v2-discover-idle-held">\n'''
new = '''            <DiscoverQueryComposer\n              value={queryDraft}\n              onValueChange={setQueryDraft}\n              onSearch={onSuggestSearch}\n              onAsk={(question) => onAskQuery?.(question, { kind: "investigation" })}\n              onAssess={onOpenAssessment}\n              idle\n            />\n            <DiscoverResearchRadar\n              catalog={catalog}\n              labIds={labIds}\n              knownRows={idleRecommendations}\n              jobs={jobs}\n              partitions={partitions}\n              shelves={shelves}\n              resourcesRollup={resourcesRollup}\n              onSearch={onSuggestSearch}\n            />\n            <div className="rd-v2-discover-idle-held">\n'''
assert old in text, "idle radar anchor changed"
text = text.replace(old, new, 1)

old = '''        {q ? (\n          <>\n            <section\n              className="rd-v2-discover-explore-workspace"\n'''
new = '''        {q ? (\n          <>\n            <DiscoverEvidenceCockpit\n              query={q}\n              rows={merged}\n              resultGroups={resultGroups}\n              filterCounts={filterCounts}\n              stateFilter={stateFilter}\n              onFilterChange={setStateFilter}\n              assessmentActive={assessmentActive}\n              assessmentResult={assessmentResult}\n              pendingCount={pendingRows.length}\n              lookupProgress={lookupProgress}\n              resourcesRollup={resourcesRollup}\n              onSearchWider={onSearchWeb}\n              onAssess={onOpenAssessment}\n            />\n            <section\n              className="rd-v2-discover-explore-workspace"\n'''
assert old in text, "query cockpit anchor changed"
text = text.replace(old, new, 1)

path.write_text(text)
