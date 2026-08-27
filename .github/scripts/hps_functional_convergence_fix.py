from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# `keep` means preserve the current Inspector lens across shell navigation until
# the next evidence selection. Entering Library used to reset Detail before the
# click, making `keep` indistinguishable from `detail` after visiting Settings.
replace_once(
    "drive/src/v2/App.jsx",
    '''      if (next === "library") {
        setTab(next);
        setRailTab("detail");
        if (opts.keepSelection) {''',
    '''      if (next === "library") {
        setTab(next);
        setRailTab((current) => loadSettings().onSelect === "keep" ? current : "detail");
        if (opts.keepSelection) {''',
)

# Home's Synthesis resume is not generic navigation: it is an exact durable
# thread handoff. Bind the exact tab + URL + rail state in one callback so no
# shell policy or stale dataset ownership can reinterpret the destination.
replace_once(
    "drive/src/v2/App.jsx",
    '''          onResumeSynthesisThread={(thread) => {
            if (!thread?.id) return;
            setFocusSynthesisThreadId(thread.id);
            setActiveObject(synthesisThreadObject(thread));
            goTab("synthesis");
          }}''',
    '''          onResumeSynthesisThread={(thread) => {
            if (!thread?.id) return;
            setFocusSynthesisThreadId(thread.id);
            setActiveObject(synthesisThreadObject(thread));
            setSelectedId("");
            setDetail(null);
            setPreviewOpen(false);
            setPreviewTarget(null);
            setRailTab("detail");
            setTab("synthesis");
            syncUrl({ tab: "synthesis", dataset: "", preview: false, q: "" });
          }}''',
)

print("HPS functional convergence follow-up fixes applied")
