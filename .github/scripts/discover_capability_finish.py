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

# Mobile reachability is a product invariant. The rendered trace showed the
# 304px controls container itself was in bounds but remained display:flex while
# each filter <details> retained flex: 0 0 auto, so the sort control painted to
# x=658 without increasing document scrollWidth. Make the toolbar a real grid
# and make its actual <details> children shrink inside those tracks.
css_path = Path("drive/src/v2/discover-visual-freeze.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Discover capability convergence: mobile control reachability. */"
if marker in css:
    raise SystemExit("mobile reachability CSS marker already exists")
css += r'''

/* Discover capability convergence: mobile control reachability. */
@media (max-width: 760px) {
  .rd-v2-discover-page .rd-v2-discover-frozen-controls {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    gap: 8px;
  }

  .rd-v2-discover-page .rd-v2-discover-frozen-controls > .rd-v2-discover-filter-menu {
    flex: none;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box;
  }

  .rd-v2-discover-page .rd-v2-discover-frozen-controls > .rd-v2-discover-filter-menu > summary {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .rd-v2-discover-page .rd-v2-discover-frozen-controls > .rd-v2-discover-filter-menu > summary > span,
  .rd-v2-discover-page .rd-v2-discover-frozen-controls > .rd-v2-discover-filter-menu > summary > strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 420px) {
  .rd-v2-discover-page .rd-v2-discover-frozen-controls {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

# Temporary diagnostic only. This test file is deliberately NOT staged by the
# one-shot commit. It prints the browser's actual grid tracks and computed
# geometry before the unchanged reachability assertion, so a green result also
# proves the fix acts on the rendered controls rather than hiding overflow.
replace_once(
    "e2e/v2-discover.spec.js",
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    expect(filterBox).not.toBeNull();''',
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    const mobileGeometry = await page.evaluate(() => {\n      const read = (selector) => {\n        const node = document.querySelector(selector);\n        if (!node) return null;\n        const rect = node.getBoundingClientRect();\n        const style = getComputedStyle(node);\n        return {\n          selector,\n          rect: { x: rect.x, y: rect.y, width: rect.width, right: rect.right },\n          display: style.display,\n          width: style.width,\n          minWidth: style.minWidth,\n          maxWidth: style.maxWidth,\n          flex: style.flex,\n          gridTemplateColumns: style.gridTemplateColumns,\n          overflowX: style.overflowX,\n        };\n      };\n      return {\n        viewport: window.innerWidth,\n        bodyScrollWidth: document.body.scrollWidth,\n        documentScrollWidth: document.documentElement.scrollWidth,\n        controls: read(".rd-v2-discover-frozen-controls"),\n        filter: read('[data-testid="discover-filter-menu"]'),\n        sort: read('[data-testid="discover-sort-menu"]'),\n        filterSummary: read('[data-testid="discover-filter-menu"] > summary'),\n        sortSummary: read('[data-testid="discover-sort-menu"] > summary'),\n      };\n    });\n    console.log("DISCOVER_MOBILE_GEOMETRY", JSON.stringify(mobileGeometry));\n    expect(filterBox).not.toBeNull();''',
    "mobile geometry diagnostic",
)

print("Applied Discover reversibility, live freeze-layer import, actual mobile control grid fix, and temporary geometry diagnostic")
