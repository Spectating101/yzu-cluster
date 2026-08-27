from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"Expected exactly one match in {path}: {old[:80]!r}; found {text.count(old)}")
    path.write_text(text.replace(old, new, 1))


evidence = Path("drive/src/v2/DiscoverEvidenceBrief.jsx")

replace_once(
    evidence,
    '''  const assessmentRequestSeqRef = useRef(0);\n  const routeRequestSeqRef = useRef(0);\n''',
    '''  const assessmentRequestSeqRef = useRef(0);\n  const routeRequestSeqRef = useRef(0);\n  // The workspace emits a fresh assessment to App so downstream decisions use\n  // one authority. App then mirrors that exact object back as assessmentValue.\n  // Distinguish that parent echo from a genuinely external replacement: an echo\n  // must not invalidate the corrected route request that the same assessment\n  // just started.\n  const emittedAssessmentRef = useRef(null);\n''',
)

replace_once(
    evidence,
    '''  useEffect(() => {\n    if (!assessmentValue) return;\n    routeRequestSeqRef.current += 1;\n    setRouteLoading(false);\n    setAssessment(assessmentValue);\n    setRouteResult(null);\n    setRouteError("");\n    routeAutoKeyRef.current = "";\n  }, [assessmentValue]);\n''',
    '''  useEffect(() => {\n    if (!assessmentValue) return;\n    if (assessmentValue === emittedAssessmentRef.current) {\n      emittedAssessmentRef.current = null;\n      return;\n    }\n    routeRequestSeqRef.current += 1;\n    setRouteLoading(false);\n    setAssessment(assessmentValue);\n    setRouteResult(null);\n    setRouteError("");\n    routeAutoKeyRef.current = "";\n  }, [assessmentValue]);\n''',
)

replace_once(
    evidence,
    '''    setRouteResult(null);\n    setRouteError("");\n    setRouteLoading(false);\n    setLoading(true);\n    setError("");\n''',
    '''    setRouteResult(null);\n    setRouteError("");\n    setRouteLoading(false);\n    emittedAssessmentRef.current = null;\n    // A corrected brief immediately retires the prior evidence verdict. While\n    // reassessment is running, the previous held-evidence judgment is historical\n    // context, not current authority. Keep the investigation mounted but blank\n    // its consequential assessment state until a fresh response establishes it.\n    setAssessment(null);\n    setDimensions([]);\n    onAssessmentChange?.(null);\n    onAssessmentActive?.(true);\n    setLoading(true);\n    setError("");\n''',
)

replace_once(
    evidence,
    '''      const next = await assessDiscoverEvidence({ question, requirement });\n      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;\n      setAssessment(next);\n      onAssessmentChange?.(next);\n      onAssessmentActive?.(true);\n''',
    '''      const next = await assessDiscoverEvidence({ question, requirement });\n      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;\n      emittedAssessmentRef.current = next;\n      setAssessment(next);\n      onAssessmentChange?.(next);\n      onAssessmentActive?.(true);\n''',
)

replace_once(
    evidence,
    '''    } catch (requestError) {\n      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;\n      setError("Assessment is unavailable. Showing the catalogue instead.");\n      onAssessmentChange?.(null);\n      onAssessmentActive?.(false);\n      // Existing catalogue search is retained only as a graceful fallback.\n      onLegacySearch?.(question);\n''',
    '''    } catch (requestError) {\n      if (assessmentRequestId !== assessmentRequestSeqRef.current) return;\n      emittedAssessmentRef.current = null;\n      // Failure establishes *absence of a current assessment*, not permission to\n      // resurrect the previous verdict or collapse the investigation workspace.\n      setAssessment(null);\n      setDimensions([]);\n      setError("Assessment is unavailable. Showing the catalogue instead.");\n      onAssessmentChange?.(null);\n      onAssessmentActive?.(true);\n      // The workspace already retains the catalogue beneath the investigation.\n      // Re-running the legacy search here would tear down the evidence position\n      // and turn an assessment failure into a navigation/state-authority change.\n      if (variant !== "workspace") onLegacySearch?.(question);\n''',
)

replace_once(
    evidence,
    '''      {variant === "workspace" && !assessment ? (\n        <div className="rd-v2-evidence-workspace-pending" role="status">\n          <span className="rd-v2-eyebrow">Evidence position</span>\n          <strong>Checking the research need against held evidence…</strong>\n          <p>Search results stay available while coverage, gaps, and sourcing options are established.</p>\n        </div>\n      ) : null}\n''',
    '''      {variant === "workspace" && !assessment ? (\n        <div\n          className={`rd-v2-evidence-workspace-pending${error ? " is-unavailable" : ""}`}\n          data-state={error ? "unavailable" : loading ? "checking" : "unmeasured"}\n          role="status"\n        >\n          <span className="rd-v2-eyebrow">Evidence position</span>\n          <strong>{error ? "Assessment is unavailable" : "Checking the research need against held evidence…"}</strong>\n          <p>\n            {error\n              ? "No current evidence verdict is established. Catalogue results remain visible; reassess before relying on held-evidence or sourcing claims."\n              : "Search results stay available while coverage, gaps, and sourcing options are established."}\n          </p>\n        </div>\n      ) : null}\n''',
)

replace_once(
    evidence,
    '''      {error ? <p className="rd-v2-discover-error" role="status">{error}</p> : null}\n''',
    '''      {error && variant !== "workspace" ? <p className="rd-v2-discover-error" role="status">{error}</p> : null}\n''',
)

# One executor only: the central Evidence Position owns assessment work. The
# Inspector rail mirrors state and must never launch a second model request when
# App temporarily has active=true/result=null during first assessment or a
# corrected reassessment.
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

app = Path("drive/src/v2/App.jsx")
replace_once(
    app,
    '''            openDiscoverHistory(job, { focusAwaiting: job?.status === "pending_approval" });\n''',
    '''            openDiscoverAwaiting({ job, focusAwaiting: job?.status === "pending_approval" });\n''',
)

replace_once(
    app,
    '''          assessmentActive={discoverAssessment.active}\n          assessmentResult={discoverAssessment.result}\n          onOpenAssessment={openDiscoverAssessment}\n          onRestingSummary={handleDiscoverRestingSummary}\n''',
    '''          assessmentActive={discoverAssessment.active}\n          assessmentResult={discoverAssessment.result}\n          onOpenAssessment={openDiscoverAssessment}\n          onAssessmentChange={(result) => {\n            setDiscoverAssessment((current) => ({ ...current, active: true, result }));\n          }}\n          onAssessmentActive={(active) => {\n            setDiscoverAssessment((current) => ({ ...current, active }));\n          }}\n          onRestingSummary={handleDiscoverRestingSummary}\n''',
)

print("Applied Discover authority-depth hardening")
