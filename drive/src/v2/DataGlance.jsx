import { useEffect, useState } from "react";
import { queryDataset } from "@/v2/api";
import { licensedRowsLocked } from "@/v2/licensedAccess";
import { formatGlanceCell, glanceColumns, glanceHeader } from "./dataGlance.js";

const SAMPLE_ROWS = 5;

export function DataGlance({ dataset }) {
  const id = dataset?.dataset_id;
  const locked = licensedRowsLocked(dataset);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!id || locked) {
      setRows(null);
      return undefined;
    }
    let cancelled = false;
    setRows(null);
    queryDataset(id, SAMPLE_ROWS)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data?.rows) ? data.rows.slice(0, SAMPLE_ROWS) : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, locked]);

  const columns = glanceColumns(rows, dataset);
  if (!columns.length) return null;

  return (
    <section className="rd-v2-library-inspector-block rd-v2-data-glance" aria-label="First rows" data-testid="library-data-glance">
      <p className="rd-v2-rail-section-label">First rows</p>
      <div className="rd-v2-data-glance-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((key) => {
                const numeric = rows.some((row) => formatGlanceCell(row[key]).numeric);
                return <th key={key} scope="col" className={numeric ? "num" : undefined} title={key}>{glanceHeader(key)}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((key) => {
                  const cell = formatGlanceCell(row[key]);
                  return <td key={key} className={cell.numeric ? "num" : undefined}>{cell.text}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
