from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Synthesis-level reversibility: the centre evidence position must let a
# researcher correct interpreted dimensions before sourcing/procurement, but
# keep the editor subordinate until deliberately opened.
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''          {variant === "layered" ? (\n            <details className="rd-v2-evidence-edit">\n              <summary>''',
    '''          {(variant === "layered" || variant === "workspace") ? (\n            <details className="rd-v2-evidence-edit">\n              <summary>''',
    "workspace compact editable brief",
)

# The dedicated Discover freeze stylesheet is the late-stage visual authority
# for this surface. It must be loaded by the real application, not merely exist
# in the repository or in screenshot tooling.
replace_once(
    "drive/src/v2/main.jsx",
    'import "./library-workspace.css";\nimport "./synthesis-workstation.css";',
    'import "./library-workspace.css";\nimport "./discover-visual-freeze.css"; /* Discover evidence investigation freeze */\nimport "./synthesis-workstation.css";',
    "Discover freeze stylesheet application import",
)

# Mobile reachability is a product invariant. The base mobile layout already
# turns the controls into two columns; force both controls and the native select
# to shrink inside those columns rather than honoring an overflowing min-content
# width.
css_path = Path("drive/src/v2/discover-visual-freeze.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Discover capability convergence: mobile control reachability. */"
if marker in css:
    raise SystemExit("mobile reachability CSS marker already exists")
css += r'''

/* Discover capability convergence: mobile control reachability. */
@media (max-width: 760px) {
  .rd-v2-discover-page .rd-v2-discover-controls-wrap,
  .rd-v2-discover-page .rd-v2-discover-frozen-controls {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .rd-v2-discover-page .rd-v2-discover-filter-wrap,
  .rd-v2-discover-page .rd-v2-discover-sort {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .rd-v2-discover-page .rd-v2-discover-sort {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .rd-v2-discover-page .rd-v2-discover-sort select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

# Temporary diagnostic only. This test file is deliberately NOT staged by the
# one-shot commit. It prints the browser's actual grid tracks and computed
# geometry before the unchanged reachability assertion, so the CSS fix is based
# on rendered truth rather than another guess.
replace_once(
    "e2e/v2-discover.spec.js",
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    expect(filterBox).not.toBeNull();''',
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    const mobileGeometry = await page.evaluate(() => {\n      const read = (selector) => {\n        const node = document.querySelector(selector);\n        if (!node) return null;\n        const rect = node.getBoundingClientRect();\n        const style = getComputedStyle(node);\n        return {\n          selector,\n          rect: { x: rect.x, y: rect.y, width: rect.width, right: rect.right },\n          display: style.display,\n          width: style.width,\n          minWidth: style.minWidth,\n          maxWidth: style.maxWidth,\n          gridTemplateColumns: style.gridTemplateColumns,\n          gridColumn: style.gridColumn,\n          overflowX: style.overflowX,\n          position: style.position,\n        };\n      };\n      return {\n        viewport: window.innerWidth,\n        bodyScrollWidth: document.body.scrollWidth,\n        documentScrollWidth: document.documentElement.scrollWidth,\n        page: read(".rd-v2-discover-page"),\n        workspace: read(".rd-v2-discover-explore-workspace"),\n        tools: read(".rd-v2-discover-query-tools"),\n        controls: read(".rd-v2-discover-frozen-controls"),\n        filter: read(".rd-v2-discover-filter-wrap"),\n        sort: read(".rd-v2-discover-sort"),\n        select: read(".rd-v2-discover-sort select"),\n      };\n    });\n    console.log("DISCOVER_MOBILE_GEOMETRY", JSON.stringify(mobileGeometry));\n    expect(filterBox).not.toBeNull();''',
    "mobile geometry diagnostic",
)

print("Applied Discover reversibility, live freeze-layer import, mobile reachability guards, and temporary geometry diagnostic")
