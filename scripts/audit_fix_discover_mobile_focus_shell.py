from pathlib import Path

rail_path = Path("drive/src/v2/InspectorRail.jsx")
css_path = Path("drive/src/v2/v2.css")
rail = rail_path.read_text()
css = css_path.read_text()

old_effect = '''  useEffect(() => {
    if (!MOBILE_RAIL_IDLE_HINTS.has(selectionHint)) {
      setMobileRailOpen(true);
    }
  }, [selectionHint]);
'''
new_effect = '''  useEffect(() => {
    if (mainTab === "browse") {
      setMobileRailOpen(Boolean(browseTarget) && railTab === "ask");
      return;
    }
    if (!MOBILE_RAIL_IDLE_HINTS.has(selectionHint)) {
      setMobileRailOpen(true);
    }
  }, [selectionHint, mainTab, browseTarget, railTab]);
'''
assert old_effect in rail, "mobile rail auto-open effect not found"
rail = rail.replace(old_effect, new_effect, 1)

anchor = '''  .rd-v2-shell.no-rail {
    grid-template-columns: minmax(0, 1fr);
  }
'''
addition = anchor + '''
  .rd-v2-shell.no-rail:has(.rd-v2-discover-focus) {
    grid-template-rows: var(--rd-header) auto minmax(0, 1fr);
    height: 100vh;
    height: 100dvh;
    min-height: 100vh;
    min-height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    overflow: hidden;
  }

  .rd-v2-shell.no-rail:has(.rd-v2-discover-focus) .yzu-main {
    min-height: 0;
    padding-bottom: 0;
    overflow: hidden;
  }

  .rd-v2-shell.no-rail:has(.rd-v2-discover-focus) .rd-v2-discover-focus {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
'''
assert anchor in css, "mobile no-rail authority block not found"
css = css.replace(anchor, addition, 1)

rail_path.write_text(rail)
css_path.write_text(css)
