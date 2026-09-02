import { useEffect, useMemo, useState } from "react";
import { facultyProfile } from "@/v2/api";
import { saveUserEmail } from "@/v2/deskSession";
import {
  PILOT_PREVIEW_EMAIL,
  buildDeskRead,
  buildLab,
  buildMemoryCards,
  buildWorks,
} from "@/v2/profileViewModel";
import { resolveSurfaceLifecycle } from "@/v2/surfaceLifecycle";
import { PageShell } from "@/v2/ui";

function memoryText(card, prefix) {
  return String(card?.text || "").replace(new RegExp(`^${prefix}:\\s*`, "i"), "");
}

function memoryLabel(card) {
  if (card?.id === "focus") return "Research focus";
  if (card?.id === "methods") return "Methods";
  if (card?.id === "also") return "Research context";
  if (card?.id === "current") return "Current research direction";
  return "Research context";
}

function holdingIds(rows = []) {
  const ids = new Set();
  for (const row of rows || []) {
    const id = String(row?.dataset_id || row?.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function evidenceRelationship(row, heldIds) {
  const ids = (row?.datasetIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  const held = ids.some((id) => heldIds.has(id));
  return {
    ...row,
    held,
    status: held ? "Held in Library" : "Recorded link · holding not confirmed",
  };
}

export function ProfilePage({ profile, libraryHoldings = [], onGoTab, onProfileRefresh }) {
  const bound = Boolean(profile && !profile.unknown);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(!bound);
  const [lookupDraft, setLookupDraft] = useState(PILOT_PREVIEW_EMAIL);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    if (bound) {
      setPreview(null);
      setPreviewLoading(false);
      setLookupError("");
      return undefined;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setLookupError("");
    facultyProfile(PILOT_PREVIEW_EMAIL)
      .then((data) => {
        if (cancelled) return;
        if (data?.found && data.profile && !data.profile.unknown) {
          setPreview(data.profile);
          setLookupDraft(data.profile.email || PILOT_PREVIEW_EMAIL);
        } else {
          setPreview(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bound]);

  const lookupFaculty = async (event) => {
    event?.preventDefault?.();
    const email = String(lookupDraft || "").trim();
    if (!email) return;
    setPreviewLoading(true);
    setLookupError("");
    try {
      const data = await facultyProfile(email);
      if (data?.found && data.profile && !data.profile.unknown) {
        setPreview(data.profile);
      } else {
        setLookupError("No faculty registry record was returned for that email.");
      }
    } catch {
      setLookupError("The faculty registry could not be reached for this lookup.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewing = !bound && Boolean(preview);
  const active = bound ? profile : preview;
  const surfaceState = resolveSurfaceLifecycle({
    loading: !bound && previewLoading && !active,
    count: bound || !previewLoading ? 1 : 0,
  });
  const name = active?.name_en || active?.name || "Faculty registry";
  const paperCount = active?.paper_count_parsed || active?.paper_count || null;
  const orgLine = [active?.title, active?.discipline].filter(Boolean).join(" · ");
  const email = active?.email || "";
  const memory = buildMemoryCards(active);
  const works = buildWorks(active);
  const lab = buildLab(active);
  const currentMemory = memory.find((card) => card.id === "current") || null;
  const savedMemory = memory.filter((card) => card.id !== "current");
  const heldIds = useMemo(() => holdingIds(libraryHoldings), [libraryHoldings]);
  const relationships = useMemo(
    () => (lab.linked || []).map((row) => evidenceRelationship(row, heldIds)),
    [lab.linked, heldIds],
  );
  const heldRelationships = relationships.filter((row) => row.held).length;

  return (
    <PageShell
      className={`rd-v2-profile-page rd-v2-profile-grounded${previewing ? " is-preview is-registry-explorer" : ""}`}
      title="Profile"
      lead={bound
        ? "What Research Drive currently knows about this researcher"
        : "Browse faculty records, then bind an identity only when you want this workspace personalized"}
      surfaceState={surfaceState}
    >
      {!bound ? (
        <section
          className="rd-v2-profile-explorer"
          data-testid="profile-know-empty"
          aria-labelledby="rd-profile-explorer-title"
        >
          <div className="rd-v2-profile-explorer-copy">
            <span>Faculty registry explorer</span>
            <h2 id="rd-profile-explorer-title">Find a researcher</h2>
            <p>
              Profile doubles as a read-only registry browser until you bind your own identity.
              Looking up a faculty record does not personalize the desk.
            </p>
          </div>
          <form className="rd-v2-profile-explorer-search" onSubmit={lookupFaculty}>
            <label htmlFor="rd-profile-faculty-search">YZU faculty email</label>
            <div>
              <input
                id="rd-profile-faculty-search"
                type="email"
                className="rd-v2-input"
                value={lookupDraft}
                placeholder="faculty@yzu.edu.tw"
                onChange={(event) => setLookupDraft(event.target.value)}
              />
              <button type="submit" className="rd-v2-btn sm primary" disabled={previewLoading || !lookupDraft.trim()}>
                {previewLoading ? "Looking up…" : "Find faculty"}
              </button>
            </div>
            {lookupError ? <p className="rd-v2-profile-explorer-error" role="alert">{lookupError}</p> : null}
          </form>
          <div className="rd-v2-profile-explorer-meta">
            <span>{previewing ? "Registry record preview" : "Registry lookup"}</span>
            <button type="button" onClick={() => onGoTab?.("settings")}>Set my own identity →</button>
          </div>
        </section>
      ) : null}

      {active ? (
        <section className="rd-v2-profile-identity" aria-label="Researcher identity">
          <div className="rd-v2-profile-ident">
            <span className="rd-v2-profile-kicker">Researcher record</span>
            {previewing ? <span className="rd-v2-profile-badge">Registry preview</span> : null}
            <h2 className="rd-v2-profile-name">{name}</h2>
            {orgLine ? <p className="rd-v2-profile-org">{orgLine}</p> : null}
            <p className="rd-v2-profile-hint">
              {email}
              {previewing ? " · Preview only" : ""}
              {active ? " · Source · faculty registry" : ""}
            </p>
          </div>
          <div className="rd-v2-profile-identity-side">
            <div className="rd-v2-profile-identity-metrics" aria-label="Researcher record summary">
              {paperCount ? (
                <span>
                  <strong>{paperCount}</strong>
                  <em>indexed works</em>
                </span>
              ) : null}
              {memory.length ? (
                <span>
                  <strong>{memory.length}</strong>
                  <em>context fields</em>
                </span>
              ) : null}
              {relationships.length ? (
                <span>
                  <strong>{heldRelationships}/{relationships.length}</strong>
                  <em>links held</em>
                </span>
              ) : null}
            </div>
            {previewing && email ? (
              <button
                type="button"
                className="rd-v2-btn sm primary"
                onClick={() => {
                  saveUserEmail(email);
                  onProfileRefresh?.();
                }}
              >
                Use as my profile
              </button>
            ) : null}
          </div>
        </section>
      ) : previewLoading ? (
        <p className="rd-v2-profile-loading">Loading faculty registry preview…</p>
      ) : (
        <section className="rd-v2-profile-explorer-empty">
          <span>Registry ready</span>
          <strong>Search a YZU faculty email above to inspect its recorded research context.</strong>
        </section>
      )}

      {active && memory.length ? (
        <section
          className="rd-v2-profile-section rd-v2-profile-memory-section"
          data-testid="profile-memory"
          aria-labelledby="profile-memory-title"
        >
          <header className="rd-v2-profile-section-head">
            <div>
              <h2 id="profile-memory-title">Research context on record</h2>
              <p>
                Specialties, methods, and research tracks recorded by the faculty registry. Displaying them here does not claim that every workflow currently personalizes itself from them.
              </p>
            </div>
            <span>Registry-backed</span>
          </header>
          <div className="rd-v2-profile-memory-layout">
            <ul className="rd-v2-profile-memory">
              {savedMemory.map((card) => (
                <li key={card.id} className="rd-v2-profile-memory-card" data-memory={card.id}>
                  <span>{memoryLabel(card)}</span>
                  <strong>
                    {memoryText(
                      card,
                      card.id === "also" ? "Also" : card.id === "methods" ? "Methods" : "Focus",
                    )}
                  </strong>
                </li>
              ))}
            </ul>
            {currentMemory ? (
              <article className="rd-v2-profile-memory-anchor" data-memory="current">
                <span>Current research direction</span>
                <strong>{memoryText(currentMemory, "Current")}</strong>
                <p>Recorded in the faculty registry.</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : active ? (
        <section className="rd-v2-profile-section" data-testid="profile-memory-thin" aria-label="Research context on record">
          <header className="rd-v2-profile-section-head">
            <div>
              <h2>Research context on record</h2>
              <p>Thin faculty profiles stay thin rather than inventing researcher context.</p>
            </div>
            <span>Registry-backed</span>
          </header>
          <p className="rd-v2-empty-inline">No specialties, methods, or current research direction are recorded.</p>
        </section>
      ) : null}

      {active && (works.items.length || works.paperCount) ? (
        <section
          className="rd-v2-profile-section rd-v2-profile-works-section"
          data-testid="profile-works"
          aria-labelledby="profile-works-title"
        >
          <header className="rd-v2-profile-section-head">
            <div>
              <h2 id="profile-works-title">Works</h2>
              <p>Indexed publication information retained in the faculty record.</p>
            </div>
            {works.paperCount ? <span>{works.paperCount} indexed</span> : null}
          </header>
          {works.items.length ? (
            <ol className="rd-v2-profile-works">
              {works.items.map((work, index) => (
                <li key={work.raw}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{work.title}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rd-v2-empty-inline">Indexed count on file; highlights not listed.</p>
          )}
        </section>
      ) : null}

      {active ? (
        <section
          className="rd-v2-profile-section rd-v2-profile-lab-section"
          data-testid="profile-lab"
          aria-labelledby="profile-lab-title"
        >
          <header className="rd-v2-profile-section-head">
            <div>
              <h2 id="profile-lab-title">Research evidence relationships</h2>
              <p>
                Evidence relationships recorded in the faculty registry, reconciled against the current Library. Library—not Profile—is the authority for whether an asset is actually held.
              </p>
            </div>
            <span>{heldRelationships} held · {relationships.length} recorded</span>
          </header>

          {relationships.length ? (
            <ul className="rd-v2-profile-lab-rows">
              {relationships.map((row) => (
                <li key={row.id}>
                  <span className="rd-v2-profile-lab-title" title={row.label}>
                    {row.label}
                    <em> — {row.routeLabel}</em>
                  </span>
                  <span className="rd-v2-profile-lab-action" data-held={row.held ? "true" : "false"}>
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rd-v2-empty-inline">No evidence relationships are recorded for this researcher.</p>
          )}

          <p className="rd-v2-profile-memory-effect" data-testid="profile-suggestion-boundary">
            Suggested evidence belongs to Home and Discover. A recommendation is not a researcher fact and is not part of this profile.
          </p>
        </section>
      ) : null}
    </PageShell>
  );
}

export function ProfileDetailPanel({ profile }) {
  const bound = Boolean(profile && !profile.unknown);

  if (!bound) {
    return (
      <div className="rd-v2-profile-rail rd-v2-profile-rail-unbound" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-block">
          <h3>Faculty registry</h3>
          <p>Profile is currently in browsing mode. Registry lookups are read-only and do not change workspace personalization.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>What you can inspect</h3>
          <p>Research context, indexed works, and recorded evidence relationships for a faculty email.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Binding is separate</h3>
          <p>Use “Use as my profile” only when the previewed researcher should become this desk’s research identity.</p>
        </section>
      </div>
    );
  }

  const read = buildDeskRead(profile, { previewing: false });

  return (
    <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
      <section className="rd-v2-profile-rail-block">
        <h3>Scholar</h3>
        <p>{read.scholar}</p>
      </section>
      {read.strengths.length ? (
        <section className="rd-v2-profile-rail-block">
          <h3>Registry strengths</h3>
          <ul>
            {read.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rd-v2-profile-rail-block">
        <h3>Record source</h3>
        <p>
          Faculty registry{profile.email ? ` · ${profile.email}` : ""}. Library separately confirms evidence possession.
        </p>
      </section>
    </div>
  );
}
