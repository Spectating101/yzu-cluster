import { FolderOpen } from "lucide-react";

export function EmptyRailState({
  title = "No dataset selected",
  hint = "Select a row in the catalog to inspect metadata, preview rows, or ask about procurement.",
}) {
  const discoverIdle = title === "No candidate selected";

  if (discoverIdle) {
    return (
      <div className="rd-v2-rail-empty-state rd-v2-discover-idle-rail" role="status" data-empty-kind="discover-idle">
        <p className="rd-v2-rail-empty-title">Search scope</p>
        <ol className="rd-v2-discover-idle-rail-path" aria-label="Discover search sequence">
          <li>
            <strong>Your Library</strong>
            <span>Check registered evidence and query-ready assets first.</span>
          </li>
          <li>
            <strong>Known source routes</strong>
            <span>Compare sources the desk already knows how to inspect or collect.</span>
          </li>
          <li>
            <strong>Wider discovery</strong>
            <span>Expand only when held evidence and known routes do not answer the need.</span>
          </li>
        </ol>
        <p className="rd-v2-rail-empty-hint">{hint}</p>
      </div>
    );
  }

  return (
    <div className="rd-v2-rail-empty-state" role="status">
      <FolderOpen className="rd-v2-rail-empty-icon" size={40} strokeWidth={1.25} aria-hidden />
      <p className="rd-v2-rail-empty-title">{title}</p>
      <p className="rd-v2-rail-empty-hint">{hint}</p>
    </div>
  );
}
