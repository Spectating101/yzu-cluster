from pathlib import Path

page = Path("drive/src/v2/LibraryPage.jsx")
text = page.read_text(encoding="utf-8")
text = text.replace('import { Chip, PageShell } from "@/v2/ui";\n', 'import { PageShell } from "@/v2/ui";\n', 1)
page.write_text(text, encoding="utf-8")

css = Path("drive/src/v2/library-evidence-rigor.css")
text = css.read_text(encoding="utf-8")
marker = "/* Library file-browser ergonomics */"
if marker not in text:
    text += '''

/* Library file-browser ergonomics */
.rd-v2-library-toolbar-search {
  flex: 1 1 300px;
  min-width: 230px;
}

.rd-v2-library-toolbar-search kbd {
  flex: 0 0 auto;
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid var(--rd-border2);
  border-radius: 5px;
  color: var(--rd-muted);
  background: rgba(255, 255, 255, 0.62);
  font-family: var(--rd-mono);
  font-size: 9px;
  line-height: 16px;
  text-align: center;
}

.rd-v2-library-toolbar-filters {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.rd-v2-library-filter-control {
  display: inline-flex;
  min-width: 0;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid var(--rd-border2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--rd-muted);
  font-size: 10px;
  white-space: nowrap;
}

.rd-v2-library-filter-control > span {
  font-family: var(--rd-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.rd-v2-library-filter-control select {
  max-width: 148px;
  padding: 0 16px 0 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--rd-text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.rd-v2-library-filter-control:focus-within {
  border-color: var(--rd-text);
  box-shadow: 0 0 0 1px rgba(31, 41, 55, 0.08);
}

.rd-v2-library-available.compact {
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--rd-border);
  border-radius: 8px;
  background: rgba(250, 249, 244, 0.42);
}

.rd-v2-library-available.compact p {
  margin: 0;
  color: var(--rd-muted);
  font-size: 11px;
  line-height: 1.4;
}

.rd-v2-library-available.compact strong {
  color: var(--rd-text);
  font-weight: 650;
}

.rd-v2-cap-ledger-row:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid rgba(45, 67, 54, 0.42);
  outline-offset: -2px;
}

@media (max-width: 1180px) {
  .rd-v2-library-toolbar-filters {
    flex-wrap: wrap;
  }

  .rd-v2-library-filter-control select {
    max-width: 118px;
  }
}

@media (max-width: 760px) {
  .rd-v2-library-toolbar-search kbd {
    display: none;
  }

  .rd-v2-library-toolbar-filters {
    width: 100%;
  }

  .rd-v2-library-filter-control {
    flex: 1 1 30%;
  }

  .rd-v2-library-filter-control select {
    width: 100%;
    max-width: none;
  }

  .rd-v2-library-available.compact {
    align-items: flex-start;
    flex-direction: column;
  }
}
'''
    css.write_text(text, encoding="utf-8")
