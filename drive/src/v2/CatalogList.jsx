import { useEffect, useMemo, useState } from "react";
import { CatalogRow } from "@/v2/CatalogRow";
import "@/v2/library-live-scale.css";

const PAGE_SIZE = 50;

function rowKey(item) {
  if (item?.kind === "folder") return `folder:${item.id}`;
  const dataset = item?.row || item;
  return `dataset:${item?.id || dataset?.dataset_id || dataset?.title || dataset?.url}`;
}

function isSelected(item, selectedId) {
  if (item?.kind === "folder") return false;
  const dataset = item?.row || item;
  return selectedId === (item?.id || dataset?.dataset_id || dataset?.title || dataset?.url);
}

function paginationNoun(rows = []) {
  const folders = rows.filter((item) => item?.kind === "folder").length;
  const assets = rows.length - folders;
  if (folders === rows.length) return "folders";
  if (assets === rows.length) return "assets";
  return "entries";
}

/** Drive-style list — folders + datasets in one scroll (Library / Home). */
export function CatalogList({
  rows = [],
  selectedId,
  onSelectDataset,
  onOpenFolder,
  onDoubleClick,
  compact = true,
  external = false,
  rowState,
}) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [rows]);

  const visibleRows = useMemo(() => rows.slice(0, visibleLimit), [rows, visibleLimit]);
  const hasMore = visibleRows.length < rows.length;
  const noun = paginationNoun(rows);

  if (!rows.length) return null;

  return (
    <>
      <ul className="rd-v2-catalog rd-v2-catalog-list" aria-label="Catalog">
        {visibleRows.map((item) => (
          <CatalogRow
            key={rowKey(item)}
            item={item}
            selected={isSelected(item, selectedId)}
            compact={compact}
            external={external || item?.external}
            rowState={rowState}
            onSelect={onSelectDataset}
            onOpenFolder={onOpenFolder}
            onDoubleClick={onDoubleClick}
          />
        ))}
      </ul>
      {rows.length > PAGE_SIZE ? (
        <div className="rd-v2-library-pagination directory" aria-label="Directory pagination">
          <span>Showing {visibleRows.length} of {rows.length} {noun}</span>
          {hasMore ? (
            <button type="button" className="rd-v2-btn sm" onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}>
              Load {Math.min(PAGE_SIZE, rows.length - visibleRows.length)} more
            </button>
          ) : (
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => setVisibleLimit(PAGE_SIZE)}>
              Back to first {PAGE_SIZE}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
