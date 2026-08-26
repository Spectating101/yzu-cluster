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

# Discover has one adaptive entrance: the page composer. The promoted centre
# workspace is the consequence of that question, not a second composer/search
# mode. Suppress the standalone textarea and idle suggestions in workspace mode
# while retaining the compact Edit brief -> Apply & reassess correction loop.
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '      {variant !== "layered" ? <form',
    '      {variant === "standalone" ? <form',
    "workspace duplicate question composer",
)
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '        variant === "layered" ? null : <div className="rd-v2-evidence-suggestions" data-testid="discover-empty">',
    '        variant !== "standalone" ? null : <div className="rd-v2-evidence-suggestions" data-testid="discover-empty">',
    "workspace duplicate idle suggestions",
)

# Once the backend assessment is active, it owns the evidence requirement. The
# lightweight lexical interpretation is useful for keyword search, but keeping
# a second surface labelled Research brief beside an assessed requirement makes
# the researcher reconcile two authorities. Hide it while assessment is active.
replace_once(
    "drive/src/v2/BrowsePage.jsx",
    '                {interpretation.chips.length ? (',
    '                {interpretation.chips.length && !assessmentActive ? (',
    "single authoritative research brief",
)
replace_once(
    "drive/src/v2/BrowsePage.jsx",
    '                      Strategy needs context',
    '                      Clarify evidence need',
    "actionable context CTA",
)
replace_once(
    "drive/src/v2/BrowsePage.jsx",
    '                      Custom strategy ready',
    '                      Review sourcing strategy',
    "actionable sourcing CTA",
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
'''
css_path.write_text(css, encoding="utf-8")

# Temporary diagnostic only. This test file is deliberately NOT staged by the
# one-shot commit. It proves the fix acts on the rendered controls rather than
# hiding overflow.
replace_once(
    "e2e/v2-discover.spec.js",
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    expect(filterBox).not.toBeNull();''',
    '''    const sortBox = await page.getByTestId("discover-sort-menu").boundingBox();\n    const mobileGeometry = await page.evaluate(() => {\n      const read = (selector) => {\n        const node = document.querySelector(selector);\n        if (!node) return null;\n        const rect = node.getBoundingClientRect();\n        const style = getComputedStyle(node);\n        return { selector, rect: { x: rect.x, width: rect.width, right: rect.right }, display: style.display, width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, flex: style.flex, gridTemplateColumns: style.gridTemplateColumns };\n      };\n      return { viewport: window.innerWidth, controls: read(".rd-v2-discover-frozen-controls"), filter: read('[data-testid="discover-filter-menu"]'), sort: read('[data-testid="discover-sort-menu"]') };\n    });\n    console.log("DISCOVER_MOBILE_GEOMETRY", JSON.stringify(mobileGeometry));\n    expect(filterBox).not.toBeNull();''',
    "mobile geometry diagnostic",
)

print("Applied Discover single-authority workspace, reversibility, actionable CTAs, live freeze layer, and mobile control fix")
