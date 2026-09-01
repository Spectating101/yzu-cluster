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

function isDemoMode() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

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

const UNBOUND_RECORD_ROWS = [
  {
    index: "01",
    title: "Research context",
    detail: "Specialties, methods, and current research direction supplied by the faculty registry.",
  },
  {
    index: "02",
    title: "Indexed works",
    detail: "Publication records associated with the bound researcher identity.",
  },
  {
    index: "03",
    title: "Evidence relationships",
    detail: "Recorded research links reconciled against what Library actually holds.",
  },
];

function UnboundProfileLedger() {
  return (
    <section
      className="rd-v2-profile-section rd-v2-profile-unbound"
      data-testid="profile-know-empty"
      aria-label="Research profile setup"
    >
      <header className="rd-v2-profile-section-head">
        <div>
          <h2>No faculty profile is bound yet</h2>
          <p>
            Research Drive remains usable without a faculty record. Bind a faculty email when this desk should carry researcher-specific context.
          </p>
        </div>
        <span>Awaiting identity</span>
      </header>
      <div className="rd-v2-profile-unbound-ledger" aria-label="Researcher record fields awaiting identity">
        {UNBOUND_RECORD_ROWS.map((row) => (
          <div className="rd-v2-profile-unbound-row" key={row.index}>
            <span>{row.index}</span>
            <strong>{row.title}</strong>
            <p>{row.detail}</p>
            <em>Not on record</em>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Profile is an epistemic record, not a routing dashboard. It reports registry
 * facts and recorded research relationships, while Library remains possession
 * authority for whether evidence is actually held.
 */
export function ProfilePage({ profile, libraryHoldings = [], onGoTab, onProfileRefresh }) {
  const bound = Boolean(profile && !profile.unknown);
  const demoMode = isDemoMode();
  const [pilot, setPilot] = useState(null);
  const [pilotLoading, setPilotLoading] = useState(!bound && demoMode);

  useEffect(() => {
    if (bound || !demoMode) {
      setPilot(null);
      setPilotLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPilotLoading(true);
    facultyProfile(PILOT_PREVIEW_EMAIL)
      .then((data) => {
        if (cancelled) return;
        if (data?.found && data.profile && !data.profile.unknown) setPilot(data.profile);
        else setPilot(null);
      })
      .catch(() => {
        if (!cancelled) setPilot(null);
      })
      .finally(() => {
        if (!cancelled) setPilotLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bound, demoMode]);

  const previewing = demoMode && !bound && Boolean(pilot);
  const active = bound ? profile : previewing ? pilot : null;
  const surfaceState = resolveSurfaceLifecycle({
    loading: !bound && demoMode && pilotLoading,
    count: active ? 1 : 0,
  });
  const name = active?.name_en || active?.name || "Research profile";
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
      className={`rd-v2-profile-page rd-v2-profile-grounded${previewing ? " is-preview" : ""}`}
      title="Profile"
      lead="What Research Drive currently knows about this researcher"
      surfaceState={surfaceState}
    >
      <section className="rd-v2-profile-identity" aria-label="Researcher identity">
        <div className="rd-v2-profile-ident">
          <span className="rd-v2-profile-kicker">Researcher record</span>
          {previewing ? <span className="rd-v2-profile-badge">Example</span> : null}
          <h2 className="rd-v2-profile-name">{name}</h2>
          {orgLine ? <p className="rd-v2-profile-org">{orgLine}</p> : null}
          <p className="rd-v2-profile-hint">
            {email || "No faculty identity is bound to this desk yet."}
            {previewing ? " · Example · pilot faculty" : ""}
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
          {previewing ? (
            <button
              type="button"
              className="rd-v2-btn sm primary"
              onClick={() => {
                saveUserEmail(PILOT_PREVIEW_EMAIL);
                onProfileRefresh?.();
              }}
            >
              Bind example identity
            </button>
          ) : !bound ? (
            <button type="button" className="rd-v2-btn sm primary" onClick={() => onGoTab?.("settings")}>
              Use my email
            </button>
          ) : null}
        </div>
      </section>

      {pilotLoading && !bound && demoMode ? (
        <p className="rd-v2-profile-loading" data-testid="profile-know-empty">
          Loading example profile…
        </p>
      ) : null}

      {(bound || previewing) && memory.length ? (
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
      ) : (bound || previewing) ? (
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

      {(bound || previewing) && (works.items.length || works.paperCount) ? (
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

      {bound || previewing ? (
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
      ) : !pilotLoading ? (
        <UnboundProfileLedger />
      ) : null}
    </PageShell>
  );
}

/** DETAIL rail for Profile: registry identity, curated strengths, and source boundary. */
export function ProfileDetailPanel({ profile }) {
  const bound = Boolean(profile && !profile.unknown);
  const demoMode = isDemoMode();
  const [pilot, setPilot] = useState(null);

  useEffect(() => {
    if (bound || !demoMode) {
      setPilot(null);
      return undefined;
    }
    let cancelled = false;
    facultyProfile(PILOT_PREVIEW_EMAIL)
      .then((data) => {
        if (!cancelled && data?.found && data.profile && !data.profile.unknown) setPilot(data.profile);
      })
      .catch(() => {
        if (!cancelled) setPilot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bound, demoMode]);

  const previewing = demoMode && !bound && Boolean(pilot);
  const active = bound ? profile : previewing ? pilot : null;
  const read = buildDeskRead(active, { previewing });

  if (!active) {
    return (
      <div className="rd-v2-profile-rail rd-v2-profile-rail-unbound" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-block">
          <h3>Research context</h3>
          <p>No faculty record is bound. Library, Discover, and Synthesis remain available without one.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Record scope</h3>
          <p>Binding adds registry-backed context, indexed works, and recorded evidence relationships.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Authority</h3>
          <p>Faculty registry supplies researcher facts. Library separately confirms whether linked evidence is actually held.</p>
        </section>
      </div>
    );
  }

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
          Faculty registry{active.email ? ` · ${active.email}` : ""}. Library separately confirms evidence possession.
        </p>
      </section>
    </div>
  );
}
