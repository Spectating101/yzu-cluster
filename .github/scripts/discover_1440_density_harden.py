from pathlib import Path


css_path = Path("drive/src/v2/discover-visual-freeze.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Discover 1440 investigation density hardening. */"
if marker not in css:
    css += r'''

/* Discover 1440 investigation density hardening. */
@media (min-width: 981px) and (max-width: 1500px) {
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 7px;
    padding: 10px 11px;
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity .rd-v2-evidence-section-head p {
    max-width: 680px;
    font-size: 9.5px;
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid > div {
    min-height: 48px;
    padding: 9px 11px;
    border-right: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 64%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 64%, transparent);
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid > div:nth-child(even) {
    border-right: 0;
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid > div:nth-last-child(-n + 2) {
    border-bottom: 0;
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid strong {
    font-size: 11.5px;
    line-height: 1.3;
  }

  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid em {
    font-size: 9.5px;
  }
}
'''
    css_path.write_text(css, encoding="utf-8")

spec_path = Path("e2e/discover-visual-convergence.spec.js")
spec = spec_path.read_text(encoding="utf-8")
needle = '''    await expect(workspace).toContainText("No worker or quota is assigned here");\n\n    const workspaceBox = await workspace.boundingBox();\n'''
replacement = '''    await expect(workspace).toContainText("No worker or quota is assigned here");\n\n    const capacityCards = workspace.locator(".rd-v2-evidence-capacity-grid > div");\n    const capacityCardBoxes = await capacityCards.evaluateAll((nodes) => nodes.map((node) => ({\n      width: node.getBoundingClientRect().width,\n      height: node.getBoundingClientRect().height,\n      clientWidth: node.clientWidth,\n      scrollWidth: node.scrollWidth,\n    })));\n    expect(capacityCardBoxes.length).toBeGreaterThan(0);\n    expect(Math.min(...capacityCardBoxes.map((box) => box.width))).toBeGreaterThanOrEqual(220);\n    expect(capacityCardBoxes.filter((box) => box.scrollWidth > box.clientWidth + 2)).toEqual([]);\n\n    const workspaceBox = await workspace.boundingBox();\n'''
if needle not in spec:
    raise SystemExit("visual convergence assertion seam not found")
spec_path.write_text(spec.replace(needle, replacement, 1), encoding="utf-8")

print("applied 1440 Discover investigation density hardening")
