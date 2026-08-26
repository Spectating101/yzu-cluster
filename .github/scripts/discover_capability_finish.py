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

print("Applied Discover reversibility and mobile reachability finish guards")
