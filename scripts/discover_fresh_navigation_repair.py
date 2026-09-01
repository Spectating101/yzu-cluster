from pathlib import Path

path = Path("drive/src/v2/App.jsx")
text = path.read_text()
old = '''      if (next === DISCOVER_TAB && !opts.preserveDiscoverScope) {
        setDiscoverPreferLive(discoverScopeIsWide());
        // A fresh navigation to Discover starts at the retrieval surface. Do not
        // inherit a Library dataset identity into Discover; direct Discover URLs
        // still hydrate selectedId before this callback ever runs.
        setSelectedId("");
        setDetail(null);
        setBrowseRow(null);
      }
      if (next === "library") {
'''
new = '''      if (next === DISCOVER_TAB && !opts.preserveDiscoverScope) {
        setDiscoverPreferLive(discoverScopeIsWide());
        // A fresh navigation to Discover starts at the retrieval surface. Do not
        // inherit a Library dataset identity into Discover; direct Discover URLs
        // still hydrate selectedId before this callback ever runs.
        setSelectedId("");
        setDetail(null);
        setBrowseRow(null);
        setTab(next);
        syncUrl({ tab: next, dataset: "" });
        return;
      }
      if (next === "library") {
'''
assert old in text, "fresh Discover navigation anchor changed"
path.write_text(text.replace(old, new, 1))
