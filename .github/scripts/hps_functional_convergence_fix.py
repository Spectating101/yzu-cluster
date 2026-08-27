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

# Home owns shell navigation through onGoTab. This callback binds only the
# durable Synthesis identity so route authority and object-focus authority stay
# separate and testable.
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
          }}''',
)

# A durable Synthesis thread has one valid workspace destination. Do not let a
# generic point.tab value reinterpret that typed handoff as Discover or Library.
replace_once(
    "drive/src/v2/HomePage.jsx",
    '      onGoTab?.(point.tab || "synthesis");',
    '      onGoTab?.("synthesis");',
)

print("HPS functional convergence follow-up fixes applied")
