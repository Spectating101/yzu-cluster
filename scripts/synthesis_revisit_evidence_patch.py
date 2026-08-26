from pathlib import Path

path = Path("drive/src/v2/SynthesisPage.jsx")
text = path.read_text(encoding="utf-8")
old = '''  useEffect(() => {
    setEvidenceProposal(null);
    setSelectedField(null);
  }, [selected?.id]);'''
new = '''  useEffect(() => {
    setEvidenceProposal(null);
    setSelectedField(null);
    // Auto-discovery is once per visit, not once forever per thread id. Leaving
    // and reopening an unmapped construction should restore its read-only held
    // evidence proposal without requiring an obsolete manual search control.
    autoEvidenceSearchRef.current = "";
  }, [selected?.id]);'''
if new in text:
    print("already applied")
elif text.count(old) == 1:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched")
else:
    raise SystemExit(f"expected one selection-reset fragment, found {text.count(old)}")
