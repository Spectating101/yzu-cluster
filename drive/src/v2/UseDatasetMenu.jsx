import { useEffect, useId, useRef, useState } from "react";

const FORMATS = [
  { id: "csv", label: "CSV", note: "Any tool" },
  { id: "xlsx", label: "Excel", note: "Opens in Excel" },
  { id: "dta", label: "Stata", note: ".dta file" },
  { id: "parquet", label: "Parquet", note: "Typed and compact" },
];

const TOOLS = [
  { id: "stata", label: "Stata", format: "dta", code: (stem) => `use "${stem}.dta", clear` },
  { id: "r", label: "R", format: "csv", code: (stem) => `df <- read.csv("${stem}.csv")` },
  { id: "python", label: "Python", format: "csv", code: (stem) => `import pandas as pd\ndf = pd.read_csv("${stem}.csv")` },
];

export function formatHref(href, format) {
  return `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
}

export function downloadStem(dataset) {
  if (dataset?.download_name) return dataset.download_name;
  const revision = String(dataset?.revision_id || "held").replace(/[^A-Za-z0-9_.-]/g, "_");
  return `${dataset?.dataset_id || "dataset"}_${revision}`;
}

export function UseDatasetMenu({ dataset, href }) {
  const ref = useRef(null);
  const tabRefs = useRef({});
  const tabId = useId();
  const [tool, setTool] = useState(TOOLS[0].id);
  const [copied, setCopied] = useState(false);
  const active = TOOLS.find((item) => item.id === tool) || TOOLS[0];
  const code = active.code(downloadStem(dataset));
  const fileLabel = FORMATS.find((item) => item.id === active.format)?.label;
  const chooseTool = (id) => {
    setTool(id);
    setCopied(false);
  };

  const moveTool = (event) => {
    const index = TOOLS.findIndex((item) => item.id === tool);
    const next = event.key === "Home" ? 0 : event.key === "End" ? TOOLS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % TOOLS.length
        : event.key === "ArrowLeft" ? (index + TOOLS.length - 1) % TOOLS.length : null;
    if (next === null) return;
    event.preventDefault();
    chooseTool(TOOLS[next].id);
    tabRefs.current[TOOLS[next].id]?.focus();
  };

  useEffect(() => {
    const onPointer = (event) => {
      const node = ref.current;
      if (node?.open && !node.contains(event.target)) node.open = false;
    };
    const onKey = (event) => {
      const node = ref.current;
      if (!node?.open || event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      node.open = false;
      node.querySelector("summary")?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="rd-v2-use-dataset" ref={ref} data-testid="library-use-dataset">
      <summary className="rd-v2-btn">Use this dataset</summary>
      <div className="rd-v2-use-dataset-panel">
        <section aria-label="Download">
          <p className="rd-v2-use-dataset-label">Download</p>
          <div className="rd-v2-use-dataset-formats">
            {FORMATS.map((item) => (
              <a key={item.id} href={formatHref(href, item.id)} download data-testid={`library-download-${item.id}`}>
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </a>
            ))}
          </div>
        </section>
        <section aria-label="Open it in your tool">
          <p className="rd-v2-use-dataset-label">Open it in</p>
          <div className="rd-v2-use-dataset-tools" role="tablist" aria-label="Tool" onKeyDown={moveTool}>
            {TOOLS.map((item) => (
              <button
                key={item.id}
                ref={(node) => { tabRefs.current[item.id] = node; }}
                id={`${tabId}-${item.id}`}
                type="button"
                role="tab"
                aria-selected={item.id === tool}
                aria-controls={`${tabId}-code`}
                tabIndex={item.id === tool ? 0 : -1}
                className={item.id === tool ? "on" : ""}
                onClick={() => chooseTool(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <pre id={`${tabId}-code`} role="tabpanel" aria-labelledby={`${tabId}-${tool}`} tabIndex={0} className="rd-v2-use-dataset-code" data-testid="library-use-dataset-code"><code>{code}</code></pre>
          <div className="rd-v2-use-dataset-foot">
            <span>Download the {fileLabel} file, then run this in the folder it saved to.</span>
            <button type="button" className="rd-v2-btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </section>
      </div>
    </details>
  );
}
