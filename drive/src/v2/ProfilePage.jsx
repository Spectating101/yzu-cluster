import { loadPinnedCompares } from "@/v2/clusterOverlap";
import { CLUSTER_NAV_DEFERRED } from "@/v2/nav-config.jsx";
import { Chip, ChipRow, PageShell } from "@/v2/ui";

function trackTitle(track) {
  if (!track) return "";
  if (typeof track === "string") return track;
  return track.title || track.name || "";
}

function corpusRows(profile, datasets) {
  const stack = profile?.lab_fintech_stack || [];
  const recs = (profile?.procurement_recommendations || []).filter(
    (r) => r.source_route && r.source_route !== "vault",
  );
  const byId = new Map(datasets.map((d) => [d.dataset_id, d]));

  if (stack.length) {
    return stack.map((item) => {
      const ids = item.registry_dataset_ids || [];
      const holdings = ids
        .map((id) => byId.get(id)?.dataset_id || id)
        .filter(Boolean)
        .join(", ");
      const gaps = recs
        .filter((r) => String(r.grant_track || r.partition_id || "") === String(item.id || item.partition_id || ""))
        .map((r) => r.dataset || r.prompt)
        .slice(0, 3);
      return {
        track: item.label || item.id || "Track",
        holdings: holdings || "—",
        gaps,
      };
    });
  }

  const tracks = profile?.research_tracks || [];
  return tracks.slice(0, 6).map((track) => {
    const title = trackTitle(track);
    const keywords = (typeof track === "object" ? track.keywords || track.tags : []) || [];
    const holdings = datasets
      .filter((d) => {
        const blob = `${d.dataset_id} ${d.name} ${d.description || ""}`.toLowerCase();
        return keywords.some((k) => blob.includes(String(k).toLowerCase()))
          || title.split(/\s+/).some((w) => w.length > 4 && blob.includes(w.toLowerCase()));
      })
      .map((d) => d.dataset_id)
      .slice(0, 3)
      .join(", ");
    const gaps = recs
      .filter((r) => title && String(r.prompt || r.dataset || "").toLowerCase().includes(title.split(" ")[0]?.toLowerCase() || ""))
      .map((r) => r.dataset || r.prompt)
      .slice(0, 3);
    return { track: title || "Track", holdings: holdings || "—", gaps };
  });
}

export function ProfilePage({ profile, datasets, compareIds = [], onGoTab }) {
  const name = profile?.name_en || profile?.name || "Research profile";
  const org = [profile?.title, profile?.discipline].filter(Boolean).join(" · ");
  const email = profile?.email || "";
  const tracks = (profile?.research_tracks || []).map(trackTitle).filter(Boolean);
  const tags = profile?.domain_tags || profile?.method_tags || [];
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "YZ";

  const pinnedIds = compareIds.filter(Boolean);
  const pinned = pinnedIds
    .map((id) => datasets.find((d) => d.dataset_id === id))
    .filter(Boolean);
  const fallbackPinned = loadPinnedCompares()
    .flatMap((p) => [datasets.find((d) => d.dataset_id === p.aId), datasets.find((d) => d.dataset_id === p.bId)])
    .filter(Boolean);
  const pinnedRows = (pinned.length ? pinned : fallbackPinned).slice(0, 4);

  const scopeRows = corpusRows(profile, datasets);

  return (
    <PageShell title={null} lead={null}>
      <div className="rd-v2-profile-hero">
        <div className="rd-v2-profile-avatar">{initials}</div>
        <div className="rd-v2-profile-ident">
          <h1 className="rd-v2-profile-name">{name}</h1>
          {org ? <p className="rd-v2-profile-org">{org}</p> : null}
          {profile?.unknown ? (
            <p className="rd-v2-profile-hint">
              Sign in with @yzu.edu.tw to load your faculty research profile (tracks, grants, corpus hints).
            </p>
          ) : email ? (
            <p className="rd-v2-profile-hint">{email}</p>
          ) : null}
        </div>
        <div className="rd-v2-profile-hero-actions">
          <Chip onClick={() => onGoTab("settings")}>Edit account</Chip>
          {profile && !profile.unknown ? (
            <Chip onClick={() => onGoTab("browse")}>Open Discover</Chip>
          ) : null}
        </div>
      </div>

      <div className="rd-v2-profile-grid">
        <div className="rd-v2-profile-col">
          <div className="rd-v2-profile-block">
            <h3>Research tracks</h3>
            {tracks.length ? (
              <ol className="rd-v2-track-list">
                {tracks.map((t, i) => (
                  <li key={`${t}-${i}`}><span className="rd-v2-track-num">{i + 1}</span>{t}</li>
                ))}
              </ol>
            ) : (
              <p className="rd-v2-empty-inline">No tracks in faculty profile.</p>
            )}
            {tags.length ? (
              <div className="rd-v2-tag-row">
                {tags.map((t) => (
                  <span key={t} className="rd-v2-tag">{t}</span>
                ))}
              </div>
            ) : null}
          </div>

          {!CLUSTER_NAV_DEFERRED ? (
          <div className="rd-v2-profile-block">
            <h3>Pinned for Cluster</h3>
            {pinnedRows.length ? (
              <div className="rd-v2-pinned-list">
                {pinnedRows.map((d) => (
                  <div key={d.dataset_id} className="rd-v2-pinned-row">
                    <div className="rd-v2-pinned-info">
                      <span className="mono small">{d.dataset_id}</span>
                      <span className="rd-v2-pinned-name">{d.name || d.dataset_id}</span>
                    </div>
                    <button type="button" className="rd-v2-btn sm" onClick={() => onGoTab("cluster")}>
                      Cluster
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rd-v2-empty-inline">Pin compares on Cluster to show them here.</p>
            )}
          </div>
          ) : null}
        </div>

        <div className="rd-v2-profile-col">
          <div className="rd-v2-profile-block">
            <h3>Corpus scope — holdings vs gaps</h3>
            {scopeRows.length ? (
              <table className="rd-v2-table">
                <thead>
                  <tr>
                    <th>Track</th>
                    <th>Holdings</th>
                    <th>Gaps</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeRows.map((row) => (
                    <tr key={row.track}>
                      <td>{row.track}</td>
                      <td className="mono small">{row.holdings}</td>
                      <td>
                        {row.gaps.length
                          ? row.gaps.map((gap) => (
                              <span key={gap} className="rd-v2-gap-chip">{gap}</span>
                            ))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rd-v2-empty-inline">Profile stack and procurement routes load from faculty registry.</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
