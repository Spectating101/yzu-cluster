from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f"Expected source or destination in {path}: {old[:80]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one source match in {path}; found {text.count(old)}")
    path.write_text(text.replace(old, new, 1))


# The prior guarded run proved these changes but its commit step accidentally
# staged only App.jsx and DiscoverEvidenceBrief.jsx. Land the two executor files
# that were present in the tested working tree so the committed tree matches the
# tree we actually certified.
browse = Path("drive/src/v2/BrowsePage.jsx")
replace_once(
    browse,
    '''                  variant="workspace"\n                  initialQuestion={q}\n                  assessmentValue={assessmentResult}\n''',
    '''                  variant="workspace"\n                  initialQuestion={q}\n                  autoAssess\n                  assessmentValue={assessmentResult}\n''',
)

inspector = Path("drive/src/v2/InspectorRail.jsx")
replace_once(
    inspector,
    '''import { DiscoverEvidenceBrief } from "@/v2/DiscoverEvidenceBrief";\n''',
    '''''',
)
replace_once(
    inspector,
    '''  const result = state?.result || {};\n  const status = String(result?.verdict || result?.assessment_status || "Coverage assessment")\n    .replaceAll("_", " ")\n    .replace(/^./, (letter) => letter.toUpperCase());\n  const gap = String(result?.gap?.statement || "").trim();\n  const held = Array.isArray(result?.held_evidence) ? result.held_evidence.length : 0;\n''',
    '''  const result = state?.result || null;\n  const pending = !result;\n  const status = pending\n    ? "Assessment in progress"\n    : String(result?.verdict || result?.assessment_status || "Coverage assessment")\n      .replaceAll("_", " ")\n      .replace(/^./, (letter) => letter.toUpperCase());\n  const gap = String(result?.gap?.statement || "").trim();\n  const held = Array.isArray(result?.held_evidence) ? result.held_evidence.length : 0;\n''',
)
replace_once(
    inspector,
    '''      <p>{gap || "No remaining gap was reported by the current assessment."}</p>\n      <dl>\n        <div><dt>Held evidence</dt><dd>{held}</dd></div>\n        <div><dt>Centre</dt><dd>Full assessment + sourcing routes</dd></div>\n      </dl>\n      <p className="muted">Use Detail for the decision summary or Ask to reason within this exact evidence need.</p>\n''',
    '''      <p>{pending ? "The central Evidence Position is establishing the current verdict. Previous assessment authority is not reused while this is pending." : gap || "No remaining gap was reported by the current assessment."}</p>\n      <dl>\n        <div><dt>Held evidence</dt><dd>{pending ? "—" : held}</dd></div>\n        <div><dt>Centre</dt><dd>{pending ? "Assessment authority" : "Full assessment + sourcing routes"}</dd></div>\n      </dl>\n      <p className="muted">{pending ? "The rail mirrors state only; it does not run a second assessment." : "Use Detail for the decision summary or Ask to reason within this exact evidence need."}</p>\n''',
)
replace_once(
    inspector,
    '''    ) : discoverAssessment?.active ? (\n      discoverAssessment.result ? (\n        <DiscoverAssessmentRailSummary state={discoverAssessment} onClose={onCloseDiscoverAssessment} />\n      ) : (\n        <DiscoverEvidenceBrief\n          key={`assessment-rail:${discoverAssessment.question}`}\n          initialQuestion={discoverAssessment.question}\n          autoAssess\n          variant="layered"\n          catalog={discoverCatalog}\n          onLegacySearch={onSuggestDiscoverSearch}\n          onAssessmentActive={onDiscoverAssessmentActive}\n          onAssessmentChange={onDiscoverAssessmentChange}\n          onClose={onCloseDiscoverAssessment}\n        />\n      )\n    ) : (\n''',
    '''    ) : discoverAssessment?.active ? (\n      <DiscoverAssessmentRailSummary state={discoverAssessment} onClose={onCloseDiscoverAssessment} />\n    ) : (\n''',
)

print("Applied the missing Discover single-executor landing files")
