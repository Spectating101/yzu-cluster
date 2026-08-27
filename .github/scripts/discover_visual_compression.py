from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Preserve the resource-rollup tri-state all the way into Discover. App owns the
# measured resource state; Discover only summarizes decision-relevant capacity.
replace_once(
    "drive/src/v2/App.jsx",
    '''          onOpenLibraryResults={openLibraryResultsFromDiscover}\n          catalog={catalog}\n          selectedId={browseSelectedId}\n''',
    '''          onOpenLibraryResults={openLibraryResultsFromDiscover}\n          catalog={catalog}\n          resourcesRollup={resourcesRollup}\n          deskHealth={health}\n          selectedId={browseSelectedId}\n''',
    "pass measured capacity into Discover",
)

# Assessment provenance is important audit evidence, but it should not consume
# the same visual weight as the researcher's current gap and ways forward.
replace_once(
    "drive/src/v2/DiscoverEvidenceBrief.jsx",
    '''          {assessment.assessment_basis ? <p className="rd-v2-evidence-basis">Basis: {assessmentBasisSummary(assessment.assessment_basis)}</p> : null}\n''',
    '''          {assessment.assessment_basis ? (\n            <details className="rd-v2-evidence-basis-details">\n              <summary>Assessment basis</summary>\n              <p className="rd-v2-evidence-basis">{assessmentBasisSummary(assessment.assessment_basis)}</p>\n            </details>\n          ) : null}\n''',
    "collapse audit basis behind progressive disclosure",
)

css_path = Path("drive/src/v2/discover-visual-freeze.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Discover visual compression: capability without workflow sprawl. */"
if marker in css:
    raise SystemExit("visual compression block already exists")
css += r'''

/* Discover visual compression: capability without workflow sprawl.
   The researcher's first scan is verdict -> evidence gap -> ways forward.
   Audit/provenance and held-record detail remain present but subordinate. */
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-assessment {
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  gap: 10px 12px;
  padding: 15px 16px 16px;
}

.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-assessment-head,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-because,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-position-grid,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-edit,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-basis-details,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace > .rd-v2-browse-loading,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace > .rd-v2-discover-error {
  grid-column: 1 / -1;
}

/* Requirement detail is already summarized by Edit brief. The decision strip
   therefore leads with held support, the unresolved gap, and sourcing state. */
.rd-v2-discover-page .rd-v2-evidence-position-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.rd-v2-discover-page .rd-v2-evidence-position-grid > div:first-child {
  display: none;
}

.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-held {
  grid-column: 1;
  padding: 10px 11px;
  border-color: color-mix(in srgb, var(--rd-border, #dbd4c5) 62%, transparent);
  background: color-mix(in srgb, var(--rd-surface, #fffdf6) 52%, transparent);
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-gap {
  grid-column: 2;
  padding: 10px 12px;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-held .rd-v2-evidence-section-head,
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-gap .rd-v2-eyebrow {
  margin-bottom: 5px;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-held ul {
  margin-top: 6px;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-held li button {
  padding-block: 7px;
}

/* Ways forward are the primary action-bearing evidence after the gap. Keep the
   source options readable side-by-side instead of making each look like a page. */
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes {
  padding: 11px 12px;
  background: color-mix(in srgb, #eef5f1 58%, var(--rd-surface, #fffdf6));
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin-top: 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 66%, transparent);
  border-radius: 6px;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list li {
  padding: 9px 10px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 60%, transparent);
  background: color-mix(in srgb, var(--rd-surface, #fffdf6) 78%, transparent);
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list li:last-child {
  border-right: 0;
}

/* Capacity is a concise feasibility strip, not an operations dashboard. */
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity {
  display: grid;
  grid-template-columns: minmax(160px, .7fr) minmax(0, 1.8fr);
  align-items: center;
  gap: 10px 14px;
  padding: 9px 11px;
  border-style: dashed;
  background: transparent;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity .rd-v2-evidence-section-head {
  margin: 0;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity .rd-v2-evidence-section-head p {
  margin-top: 3px;
  font-size: 9px;
  line-height: 1.35;
}
.rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity-grid {
  margin: 0;
}

.rd-v2-discover-page .rd-v2-evidence-basis-details {
  color: var(--rd-muted, #6e7685);
  font-size: 9px;
}
.rd-v2-discover-page .rd-v2-evidence-basis-details summary {
  width: fit-content;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: .02em;
}
.rd-v2-discover-page .rd-v2-evidence-basis-details .rd-v2-evidence-basis {
  margin: 6px 0 0;
}

@media (max-width: 980px) {
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-assessment {
    grid-template-columns: 1fr;
  }
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-held,
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-gap {
    grid-column: 1;
  }
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-capacity {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .rd-v2-discover-page .rd-v2-evidence-position-grid,
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list {
    grid-template-columns: 1fr;
  }
  .rd-v2-discover-page .rd-v2-evidence-position-grid > div,
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list li {
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--rd-border, #dbd4c5) 60%, transparent);
  }
  .rd-v2-discover-page .rd-v2-evidence-position-grid > div:last-child,
  .rd-v2-discover-page .rd-v2-evidence-brief.is-workspace .rd-v2-evidence-routes-list li:last-child {
    border-bottom: 0;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

print("Applied Discover resource propagation and visual capability compression")
