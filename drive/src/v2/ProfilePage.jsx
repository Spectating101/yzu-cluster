import { useMemo } from "react";
import {
  buildDeskRead,
  buildLab,
  buildMemoryCards,
  buildWorks,
} from "@/v2/profileViewModel";
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

const PROJECT_SURFACES = [
  {
    id: "discover",
    step: "01",
    title: "Discover",
    copy: "Find, compare, and inspect research material before it becomes part of the workspace record.",
  },
  {
    id: "library",
    step: "02",
    title: "Library",
    copy: "Keep evidence, provenance, and durable research holdings inspectable after discovery.",
  },
  {
    id: "synthesis",
    step: "03",
    title: "Synthesis",
    copy: "Turn selected evidence into structured research work while keeping source boundaries visible.",
  },
];

const PROJECT_PRINCIPLES = [
  ["Evidence stays inspectable", "A result should remain traceable to the source or workspace record that supports it."],
  ["Context stays explicit", "Research context is shown as context, not silently promoted into a fact or instruction."],
  ["Holdings stay authoritative", "Library determines what the workspace actually possesses; links and suggestions do not."],
  ["Recommendations stay separate", "Suggested next actions belong to the workflow that produced them, not to the researcher record."],
];

function GuestProjectProfile({ onGoTab }) {
  return (
    <>
      <section className="rd-v2-profile-project-hero" data-testid="profile-project-overview">
        <div className="rd-v2-profile-project-copy">
          <span>Research Drive</span>
          <h2>Research evidence, kept inspectable.</h2>
          <p>
            Research Drive is a workspace for discovering, organizing, inspecting, and
            synthesizing scholarly material without losing the evidence trail that produced the work.
          </p>
          <div className="rd-v2-profile-project-actions">
            <button type="button" className="rd-v2-btn sm primary" onClick={() => onGoTab?.("discover")}>
              Explore Discover
            </button>
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => onGoTab?.("library")}>
              Open Library
            </button>
          </div>
        </div>
        <aside className="rd-v2-profile-project-model" aria-label="Research Drive workspace model">
          <span>Workspace model</span>
          <strong>Discover → Library → Synthesis</strong>
          <p>
            Profile is neutral in guest mode. When a user identity is available, this surface becomes the
            research-context record Research Drive can operate from.
          </p>
        </aside>
      </section>

      <section className="rd-v2-profile-project-section" aria-labelledby="profile-project-surfaces-title">
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="profile-project-surfaces-title">What this workspace does</h2>
            <p>Three working surfaces, one durable evidence trail.</p>
          </div>
          <span>Platform map</span>
        </header>
        <div className="rd-v2-profile-project-surfaces">
          {PROJECT_SURFACES.map((surface) => (
            <article key={surface.id}>
              <span>{surface.step}</span>
              <strong>{surface.title}</strong>
              <p>{surface.copy}</p>
              <button type="button" onClick={() => onGoTab?.(surface.id)}>
                Open {surface.title} →
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rd-v2-profile-project-section" aria-labelledby="profile-project-principles-title">
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="profile-project-principles-title">How Research Drive treats research context</h2>
            <p>The project is designed around evidence boundaries rather than an opaque recommendation profile.</p>
          </div>
          <span>Operating principles</span>
        </header>
        <div className="rd-v2-profile-project-principles">
          {PROJECT_PRINCIPLES.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rd-v2-profile-project-transition" aria-label="Signed-in profile behavior">
        <div>
          <span>When you sign in</span>
          <strong>This page becomes about you, not about the project.</strong>
        </div>
        <p>
          Research Drive shows the identity, research context, works, and evidence relationships it has on record,
          including what is known, what is missing, and what the Library can actually confirm.
        </p>
      </section>
    </>
  );
}

function UserContextProfile({ profile, libraryHoldings = [] }) {
  const name = profile?.name_en || profile?.name || "Researcher";
  const paperCount = profile?.paper_count_parsed || profile?.paper_count || null;
  const orgLine = [profile?.title, profile?.discipline].filter(Boolean).join(" · ");
  const email = profile?.email || "";
  const memory = buildMemoryCards(profile);
  const works = buildWorks(profile);
  const lab = buildLab(profile);
  const currentMemory = memory.find((card) => card.id === "current") || null;
  const savedMemory = memory.filter((card) => card.id !== "current");
  const heldIds = useMemo(() => holdingIds(libraryHoldings), [libraryHoldings]);
  const relationships = useMemo(
    () => (lab.linked || []).map((row) => evidenceRelationship(row, heldIds)),
    [lab.linked, heldIds],
  );
  const heldRelationships = relationships.filter((row) => row.held).length;

  return (
    <>
      <section className="rd-v2-profile-identity rd-v2-profile-user-identity" aria-label="User research identity">
        <div className="rd-v2-profile-ident">
          <span className="rd-v2-profile-kicker">Your research profile</span>
          <span className="rd-v2-profile-badge">Context on record</span>
          <h2 className="rd-v2-profile-name">{name}</h2>
          {orgLine ? <p className="rd-v2-profile-org">{orgLine}</p> : null}
          <p className="rd-v2-profile-hint">
            {email || "No faculty email on record"}
            {" · Source · faculty registry"}
          </p>
        </div>
        <div className="rd-v2-profile-identity-side">
          <div className="rd-v2-profile-identity-metrics" aria-label="Research context summary">
            <span>
              <strong>{memory.length}</strong>
              <em>context fields</em>
            </span>
            <span>
              <strong>{works.paperCount || works.items.length || paperCount || 0}</strong>
              <em>indexed works</em>
            </span>
            <span>
              <strong>{heldRelationships}/{relationships.length}</strong>
              <em>evidence links held</em>
            </span>
          </div>
        </div>
      </section>

      <section className="rd-v2-profile-context-contract" aria-labelledby="profile-context-contract-title">
        <div>
          <span>Context available to the desk</span>
          <h2 id="profile-context-contract-title">What Research Drive can operate from</h2>
        </div>
        <div className="rd-v2-profile-context-contract-grid">
          <article>
            <span>Identity</span>
            <strong>{email ? "Bound researcher record" : "Partial researcher record"}</strong>
            <p>Explicit identity and academic context from the profile source.</p>
          </article>
          <article>
            <span>Evidence</span>
            <strong>{libraryHoldings.length ? `${libraryHoldings.length} Library holding${libraryHoldings.length === 1 ? "" : "s"}` : "No held evidence reported"}</strong>
            <p>Library remains the authority for what evidence this workspace actually possesses.</p>
          </article>
          <article>
            <span>Boundary</span>
            <strong>Suggestions are not profile facts</strong>
            <p>Recommendations and task state remain attached to the workflow that produced them.</p>
          </article>
        </div>
      </section>

      <section
        className="rd-v2-profile-section rd-v2-profile-memory-section"
        data-testid="profile-memory"
        aria-labelledby="profile-memory-title"
      >
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="profile-memory-title">Context Research Drive has on record</h2>
            <p>
              Explicit specialties, methods, and research direction available from the bound profile.
              Missing fields stay missing rather than being invented.
            </p>
          </div>
          <span>Profile-backed</span>
        </header>
        {memory.length ? (
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
                <p>Recorded in the bound profile.</p>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="rd-v2-profile-record-empty">
            <span>Nothing inferred</span>
            <strong>No research focus, methods, or current direction are recorded yet.</strong>
            <p>The rest of the Profile remains available so sparse records do not become a different page type.</p>
          </div>
        )}
      </section>

      <section
        className="rd-v2-profile-section rd-v2-profile-works-section"
        data-testid="profile-works"
        aria-labelledby="profile-works-title"
      >
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="profile-works-title">Works on record</h2>
            <p>Publication information associated with the bound researcher profile.</p>
          </div>
          <span>{works.paperCount || works.items.length || paperCount || 0} indexed</span>
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
          <div className="rd-v2-profile-record-empty compact">
            <span>Works</span>
            <strong>{works.paperCount || paperCount ? "An indexed count exists, but publication highlights are not listed." : "No works are recorded for this profile yet."}</strong>
          </div>
        )}
      </section>

      <section
        className="rd-v2-profile-section rd-v2-profile-lab-section"
        data-testid="profile-lab"
        aria-labelledby="profile-lab-title"
      >
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="profile-lab-title">Evidence relationships</h2>
            <p>
              Recorded relationships are reconciled against the current Library. Profile can describe a link;
              Library determines whether the evidence is actually held.
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
          <div className="rd-v2-profile-record-empty compact">
            <span>Evidence</span>
            <strong>No evidence relationships are recorded for this profile yet.</strong>
          </div>
        )}

        <p className="rd-v2-profile-memory-effect" data-testid="profile-suggestion-boundary">
          Suggestions belong to the workflow that produced them. They are not promoted into your Profile as researcher facts.
        </p>
      </section>
    </>
  );
}

export function ProfilePage({ profile, libraryHoldings = [], onGoTab }) {
  const signedIn = Boolean(profile && !profile.unknown);

  return (
    <PageShell
      className={`rd-v2-profile-page rd-v2-profile-grounded ${signedIn ? "is-user-profile" : "is-project-profile"}`}
      title="Profile"
      lead={signedIn
        ? "What Research Drive knows about you, and the context available when it organizes and recommends research."
        : "About Research Drive, its evidence model, and how this workspace is designed to operate."}
      surfaceState="ready"
    >
      {signedIn ? (
        <UserContextProfile profile={profile} libraryHoldings={libraryHoldings} />
      ) : (
        <GuestProjectProfile onGoTab={onGoTab} />
      )}
    </PageShell>
  );
}

export function ProfileDetailPanel({ profile }) {
  const signedIn = Boolean(profile && !profile.unknown);

  if (!signedIn) {
    return (
      <div className="rd-v2-profile-rail rd-v2-profile-rail-project" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-block">
          <h3>Research Drive</h3>
          <p>A research evidence workspace built around inspectable sources, durable holdings, and explicit context.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Guest profile</h3>
          <p>No user context is assumed here. This surface describes the project until a researcher profile is available.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Evidence first</h3>
          <p>Library holdings remain authoritative; recommendations and recorded links stay distinguishable from possessed evidence.</p>
        </section>
      </div>
    );
  }

  const read = buildDeskRead(profile, { previewing: false });

  return (
    <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
      <section className="rd-v2-profile-rail-block">
        <h3>Researcher</h3>
        <p>{read.scholar}</p>
      </section>
      {read.strengths.length ? (
        <section className="rd-v2-profile-rail-block">
          <h3>Context on record</h3>
          <ul>
            {read.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rd-v2-profile-rail-block">
          <h3>Context on record</h3>
          <p>No additional research strengths or specialties are recorded yet.</p>
        </section>
      )}
      <section className="rd-v2-profile-rail-block">
        <h3>Context boundary</h3>
        <p>
          Profile describes researcher context. Library separately confirms evidence possession, and workflow recommendations remain separate.
        </p>
      </section>
    </div>
  );
}
