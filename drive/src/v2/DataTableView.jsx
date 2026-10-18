import { useEffect, useMemo, useRef, useState } from "react";
import { queryDataset } from "@/v2/api";
import { datasetDownloadHref } from "@/v2/askDownloadLink";
import { MEMBERS_ONLY_TEXT, licensedRowsLocked } from "@/v2/deskPermissions";
import { previewCellValue } from "@/v2/previewValue";
import { DATA_TABLE_ROW_LIMIT, filterRows, numericColumns, pageOf, sortRows, tableColumns } from "./dataTable.js";

export function DataTableView({ dataset, onClose }) {
  const datasetId = dataset?.dataset_id || "";
  const rowsLocked = licensedRowsLocked(dataset);
  const [state, setState] = useState({ datasetId: "", loading: true, rows: [], error: "" });
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState({ column: "", direction: "asc" });
  const [page, setPage] = useState(0);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!datasetId) return undefined;
    let cancelled = false;
    setFilter("");
    setSort({ column: "", direction: "asc" });
    setPage(0);
    if (rowsLocked) {
      setState({ datasetId, loading: false, rows: [], error: MEMBERS_ONLY_TEXT });
      return undefined;
    }
    setState({ datasetId, loading: true, rows: [], error: "" });
    queryDataset(datasetId, DATA_TABLE_ROW_LIMIT)
      .then((payload) => {
        if (!cancelled) setState({ datasetId, loading: false, rows: Array.isArray(payload?.rows) ? payload.rows : [], error: "" });
      })
      .catch((cause) => {
        if (!cancelled) setState({ datasetId, loading: false, rows: [], error: cause?.message || "The rows could not be loaded." });
      });
    return () => { cancelled = true; };
  }, [datasetId, rowsLocked]);

  useEffect(() => {
    if (!datasetId) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [datasetId, onClose]);

  const columns = useMemo(() => tableColumns(state.rows), [state.rows]);
  const numeric = useMemo(() => numericColumns(state.rows, columns), [state.rows, columns]);
  const visible = useMemo(
    () => sortRows(filterRows(state.rows, filter, columns), sort.column, sort.direction),
    [state.rows, filter, columns, sort],
  );
  const current = pageOf(visible, page);

  if (!datasetId) return null;
  const title = dataset.title || dataset.name || datasetId;
  const total = Number(dataset.row_count || dataset.rows || 0);
  const capped = state.rows.length >= DATA_TABLE_ROW_LIMIT && total > state.rows.length;
  const downloadHref = datasetDownloadHref(dataset);
  const toggleSort = (column) => {
    setSort((prior) => (prior.column === column
      ? { column, direction: prior.direction === "asc" ? "desc" : "asc" }
      : { column, direction: "asc" }));
    setPage(0);
  };

  return (
    <div className="rd-preview-scrim rd-datatable-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className="rd-preview-shell rd-datatable-shell" role="dialog" aria-modal="true" aria-label={`${title} data`} data-testid="data-table-view">
        <header className="rd-preview-header">
          <div className="rd-datatable-identity">
            <strong>{title}</strong>
            <span>
              {state.loading
                ? "Loading rows…"
                : `${state.rows.length.toLocaleString()} rows loaded${capped ? ` of ${total.toLocaleString()}; download the CSV for all of them` : ""} · ${columns.length} columns`}
            </span>
          </div>
          <div className="rd-datatable-actions">
            {downloadHref ? <a className="rd-v2-btn sm" href={downloadHref} download data-testid="data-table-download">Download CSV</a> : null}
            <button ref={closeRef} type="button" className="rd-preview-close" onClick={onClose} aria-label="Close data view">×</button>
          </div>
        </header>
        <div className="rd-datatable-toolbar">
          <input
            type="search"
            value={filter}
            onChange={(event) => { setFilter(event.target.value); setPage(0); }}
            placeholder="Filter rows…"
            aria-label="Filter rows"
            disabled={state.loading || !state.rows.length}
          />
          <span role="status">
            {filter.trim() ? `${visible.length.toLocaleString()} matching · ` : ""}
            {current.first ? `Rows ${current.first.toLocaleString()}–${current.last.toLocaleString()} of ${visible.length.toLocaleString()}` : "No rows"}
          </span>
          <div className="rd-datatable-pager">
            <button type="button" className="rd-v2-btn sm" disabled={current.page === 0} onClick={() => setPage(current.page - 1)}>Previous</button>
            <button type="button" className="rd-v2-btn sm" disabled={current.page >= current.pages - 1} onClick={() => setPage(current.page + 1)}>Next</button>
          </div>
        </div>
        <div className="rd-preview-body">
          {state.loading ? <div className="rd-preview-loading" role="status"><span /><p>Loading rows…</p></div> : null}
          {!state.loading && state.error ? <p className="rd-datatable-message">{state.error}</p> : null}
          {!state.loading && !state.error && !state.rows.length ? <p className="rd-datatable-message">The query returned no rows.</p> : null}
          {!state.loading && state.rows.length ? (
            <div className="rd-preview-table-wrap">
              <table className="rd-preview-table rd-datatable-table">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className={numeric.has(column) ? "num" : undefined} aria-sort={sort.column === column ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                        <button type="button" onClick={() => toggleSort(column)}>
                          {column}
                          <span aria-hidden="true">{sort.column === column ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.rows.map((row, index) => (
                    <tr key={current.first + index}>
                      {columns.map((column) => (
                        <td key={column} className={numeric.has(column) ? "num" : undefined}>{previewCellValue(row?.[column], { empty: "", maxLength: 120 })}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
