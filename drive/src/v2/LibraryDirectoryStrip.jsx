function collectionCount(folder = {}) {
  const direct = Number(folder.dataset_count || folder.asset_count || folder.count || 0);
  return Number.isFinite(direct) && direct > 0 ? direct : 0;
}

function belongsToCollection(folderId, collectionId) {
  const folder = String(folderId || "");
  const collection = String(collectionId || "");
  if (!folder || !collection) return false;
  return folder === collection || folder.startsWith(`${collection}/`);
}

export function LibraryDirectoryStrip({
  collections = [],
  collectionsLoading = false,
  folderId = "",
  assetCount = 0,
  onOpenCollection,
  onOpenRoot,
}) {
  if (!collections.length && !collectionsLoading) return null;

  const inFolder = Boolean(folderId);

  return (
    <nav
      className={`rd-v2-library-directory-strip${inFolder ? " in-folder" : " at-root"}`}
      data-testid="library-directory-home"
      aria-label="Library directory"
    >
      <button
        type="button"
        className={`rd-v2-library-directory-label${inFolder ? " navigable" : ""}`}
        onClick={() => inFolder && onOpenRoot?.()}
        disabled={!inFolder}
        aria-label={inFolder ? "Return to all Library evidence" : undefined}
      >
        <span>Directory</span>
        {inFolder ? <b>All evidence</b> : <b>{assetCount} assets</b>}
      </button>

      {collections.length ? (
        <div className="rd-v2-library-directory-list" data-testid="library-directory-list">
          {collections.map((collection) => {
            const active = belongsToCollection(folderId, collection.id);
            const count = collectionCount(collection);
            return (
              <button
                key={collection.id}
                type="button"
                className={`rd-v2-library-directory-entry${active ? " active" : ""}`}
                data-testid="library-collection-filter"
                aria-current={active ? "page" : undefined}
                onClick={() => onOpenCollection?.(collection)}
                title={collection.blurb || collection.name || collection.label || collection.id}
              >
                <span>{collection.name || collection.label || collection.id}</span>
                {count ? <b>{count}</b> : null}
                <span className="rd-v2-library-directory-arrow" aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="rd-v2-library-directory-loading" role="status" data-testid="library-collections-loading">
          Organizing collections…
        </span>
      )}
    </nav>
  );
}
