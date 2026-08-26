from pathlib import Path

path = Path("drive/src/v2/SynthesisPage.jsx")
text = path.read_text(encoding="utf-8")
old = '''  useEffect(() => {\n    if (!selected?.id || !isPreAcceptance(selected) || evidenceNodes(selected).length) return;\n    if (evidenceProposal || mappingEvidence || autoEvidenceSearchRef.current === selected.id) return;\n'''
new = '''  useEffect(() => {\n    const hasMethodShape = Boolean(selected?.state?.proposal) || recommendedConstruction(selected).present;\n    if (!selected?.id || !isPreAcceptance(selected) || evidenceNodes(selected).length || hasMethodShape) return;\n    if (evidenceProposal || mappingEvidence || autoEvidenceSearchRef.current === selected.id) return;\n'''
if text.count(old) != 1:
    raise SystemExit(f"Ground-only evidence gate anchor: expected 1 match, got {text.count(old)}")
text = text.replace(old, new, 1)
text = text.replace(
    '''  // Held-evidence discovery is read-only and deterministic. Run it once when a\n  // pre-acceptance thread first needs evidence; the researcher still decides\n  // which inputs are actually added to the durable construction.\n''',
    '''  // Held-evidence discovery is read-only and deterministic. Run it once only\n  // while the thread genuinely needs Grounding. Once a recommendation or\n  // proposal exists, re-running discovery is out-of-sequence and can obscure\n  // the method decision the researcher is already being asked to make.\n''',
    1,
)
path.write_text(text, encoding="utf-8")
