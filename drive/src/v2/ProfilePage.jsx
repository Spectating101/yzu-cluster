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
  if (card?.id === "also") return "Additional context";
  if (card?.id === "current") return "Current research";
  return "Research context";
}

function initials(value) {
  const words = String(value || "Researcher")
    .replace(/[,._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "R";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
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
    status: held ? "Held in Library" : "Recorded link · not held",
  };
}

const PROJECT_SURFACES = [
  {
    id: "discover",
    title: "Discover",
    copy: "Find and inspect research material before deciding what belongs in the workspace.",
  },
  {
    id: "library",
    title: "Library",
    copy: "Keep evidence and provenance as durable, inspectable research holdings.",
  },
  {
    id: "synthesis",
    title: "Synthesis",
    copy: "Work from selected evidence while keeping source boundaries visible.",
  },
];

const PROJECT_PRINCIPLES = [
  ["Evidence stays inspectable", "Research material remains traceable to the source or workspace record that supports it."],
  ["Context stays explicit", "Research context is shown as context instead of being silently promoted into fact."],
  ["Library stays authoritative", "A recorded relationship is not treated as a held source until Library confirms it."],
];

function SettingLikeRow({ label, copy, action }) {
  return (
    <div className="rd-v2-profile-simple-row">
      <div>
        <strong>{label}</strong>
        {copy ? <p>{copy}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

function GuestProjectProfile({ onGoTab }) {
  return (
    <div className="rd-v2-profile-personalization rd-v2-profile-about-project">
      <section className="rd-v2-profile-about-header" aria-label="About Research Drive">
        <div className="rd-v2-profile-avatar is-product">RD</div>
        <div className="rd-v2-profile-about-copy">
          <span>About</span>
          <h2>Research Drive</h2>
          <p>Research evidence workspace</p>
        </div>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-about-title">
        <header>
          <h3 id="profile-about-title">About Research Drive</h3>
        </header>
        <p className="rd-v2-profile-section-copy">
          Research Drive helps you discover, organize, inspect, and work from scholarly material without losing the evidence trail behind the work.
        </p>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-capabilities-title">
        <header>
          <h3 id="profile-capabilities-title">What it does</h3>
        </header>
        <div className="rd-v2-profile-simple-list">
          {PROJECT_SURFACES.map((surface) => (
            <SettingLikeRow
              key={surface.id}
              label={surface.title}
              copy={surface.copy}
              action={(
                <button type="button" className="rd-v2-profile-row-action" onClick={() => onGoTab?.(surface.id)}>
                  Open
                </button>
              )}
            />
          ))}
        </div>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-principles-title">
        <header>
          <h3 id="profile-principles-title">How it handles research</h3>
        </header>
        <div className="rd-v2-profile-simple-list">
          {PROJECT_PRINCIPLES.map(([label, copy]) => (
            <SettingLikeRow key={label} label={label} copy={copy} />
          ))}
        </div>
      </section>

      <section className="rd-v2-profile-simple-section rd-v2-profile-signin-note" aria-labelledby="profile-signin-title">
        <header>
          <h3 id="profile-signin-title">When you sign in</h3>
        </header>
        <p className="rd-v2-profile-section-copy">
          Profile becomes personal: it shows the identity and research context Research Drive has on record for you, plus the boundaries around what the workspace can use when organizing and recommending research.
        </p>
      </section>
    </div>
  );
}

function UserContextProfile({ profile, libraryHoldings = [], onGoTab }) {
  const name = profile?.name_en || profile?.name || "Researcher";
  const orgLine = [profile?.title, profile?.discipline].filter(Boolean).join(" · ");
  const email = profile?.email || "";
  const memory = buildMemoryCards(profile);
  const works = buildWorks(profile);
  const lab = buildLab(profile);
  const heldIds = useMemo(() => holdingIds(libraryHoldings), [libraryHoldings]);
  const relationships = useMemo(
    () => (lab.linked || []).map((row) => evidenceRelationship(row, heldIds)),
    [lab.linked, heldIds],
  );
  const heldRelationships = relationships.filter((row) => row.held).length;
  const paperCount = works.paperCount || works.items.length || profile?.paper_count_parsed || profile?.paper_count || 0;

  return (
    <div className="rd-v2-profile-personalization rd-v2-profile-about-user">
      <section className="rd-v2-profile-about-header" aria-label="About you">
        <div className="rd-v2-profile-avatar">{initials(name)}</div>
        <div className="rd-v2-profile-about-copy">
          <span>About you</span>
          <h2>{name}</h2>
          <p>{orgLine || "Researcher"}</p>
          {email ? <small>{email}</small> : null}
        </div>
        <button type="button" className="rd-v2-btn sm ghost rd-v2-profile-manage" onClick={() => onGoTab?.("settings")}>
          Manage
        </button>
      </section>

      <section className="rd-v2-profile-simple-section" data-testid="profile-memory" aria-labelledby="profile-context-title">
        <header>
          <h3 id="profile-context-title">Research context</h3>
          <p>Context Research Drive can use across the workspace.</p>
        </header>
        <div className="rd-v2-profile-simple-list">
          {memory.length ? memory.map((card) => {
            const prefix = card.id === "current" ? "Current" : card.id === "methods" ? "Methods" : card.id === "also" ? "Also" : "Focus";
            return (
              <SettingLikeRow
                key={card.id}
                label={memoryLabel(card)}
                copy={memoryText(card, prefix)}
              />
            );
          }) : (
            <SettingLikeRow
              label="Research context"
              copy="No research focus, methods, or current direction are recorded yet."
            />
          )}
        </div>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-context-use-title">
        <header>
          <h3 id="profile-context-use-title">What Research Drive uses</h3>
          <p>The visible context boundary behind organization and recommendations.</p>
        </header>
        <div className="rd-v2-profile-simple-list">
          <SettingLikeRow
            label="Research profile"
            copy={email ? "Identity and academic context are loaded from the bound research profile." : "Only the identity fields currently on record are available."}
            action={<span className="rd-v2-profile-row-value">{email ? "Connected" : "Partial"}</span>}
          />
          <SettingLikeRow
            label="Library context"
            copy="Library determines which evidence this workspace actually holds."
            action={<span className="rd-v2-profile-row-value">{libraryHoldings.length} held</span>}
          />
          <SettingLikeRow
            label="Evidence relationships"
            copy="Recorded profile links are checked against current Library holdings."
            action={<span className="rd-v2-profile-row-value">{heldRelationships}/{relationships.length} held</span>}
          />
          <SettingLikeRow
            label="Recommendations"
            copy="Suggestions stay attached to the workflow that produced them instead of becoming profile facts."
            action={<span className="rd-v2-profile-row-value">Workflow-specific</span>}
          />
        </div>
      </section>

      <section className="rd-v2-profile-simple-section" data-testid="profile-works" aria-labelledby="profile-works-title">
        <header>
          <h3 id="profile-works-title">Works on record</h3>
          <p>{paperCount ? `${paperCount} indexed work${paperCount === 1 ? "" : "s"}` : "No works are recorded yet."}</p>
        </header>
        {works.items.length ? (
          <div className="rd-v2-profile-works-clean">
            {works.items.map((work) => (
              <div key={work.raw} className="rd-v2-profile-work-row">
                <strong>{work.title}</strong>
              </div>
            ))}
          </div>
        ) : (
          <SettingLikeRow
            label="Publications"
            copy={paperCount ? "An indexed count exists, but publication highlights are not listed in this profile." : "Nothing has been added to this profile yet."}
          />
        )}
      </section>

      <section className="rd-v2-profile-simple-section" data-testid="profile-lab" aria-labelledby="profile-evidence-title">
        <header>
          <h3 id="profile-evidence-title">Evidence relationships</h3>
          <p>Profile can describe a relationship; Library decides whether the evidence is actually held.</p>
        </header>
        {relationships.length ? (
          <div className="rd-v2-profile-simple-list">
            {relationships.map((row) => (
              <SettingLikeRow
                key={row.id}
                label={row.label}
                copy={row.routeLabel}
                action={<span className="rd-v2-profile-row-value" data-held={row.held ? "true" : "false"}>{row.status}</span>}
              />
            ))}
          </div>
        ) : (
          <SettingLikeRow label="Evidence" copy="No evidence relationships are recorded for this profile yet." />
        )}
        <p className="rd-v2-profile-context-note" data-testid="profile-suggestion-boundary">
          Profile shows context Research Drive may use; it does not silently turn suggestions into facts about you.
        </p>
      </section>
    </div>
  );
}

export function ProfilePage({ profile, libraryHoldings = [], onGoTab }) {
  const signedIn = Boolean(profile && !profile.unknown);

  return (
    <PageShell
      className={`rd-v2-profile-page rd-v2-profile-grounded ${signedIn ? "is-user-profile" : "is-project-profile"}`}
      title="Profile"
      lead={signedIn
        ? "Personal details and research context Research Drive can use across your workspace."
        : "About Research Drive and the evidence principles behind the workspace."}
      surfaceState="ready"
    >
      {signedIn ? (
        <UserContextProfile profile={profile} libraryHoldings={libraryHoldings} onGoTab={onGoTab} />
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
          <h3>About this profile</h3>
          <p>Guest mode describes Research Drive itself. No personal research context is assumed.</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Evidence model</h3>
          <p>Sources stay inspectable, context stays explicit, and Library remains authoritative for held evidence.</p>
        </section>
      </div>
    );
  }

  const read = buildDeskRead(profile, { previewing: false });

  return (
    <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
      <section className="rd-v2-profile-rail-block">
        <h3>Profile context</h3>
        <p>{read.scholar}</p>
      </section>
      <section className="rd-v2-profile-rail-block">
        <h3>Used across Research Drive</h3>
        <p>Visible profile context may shape organization and recommendations. Workflow suggestions remain separate.</p>
      </section>
      {read.strengths.length ? (
        <section className="rd-v2-profile-rail-block">
          <h3>On record</h3>
          <ul>
            {read.strengths.slice(0, 4).map((strength) => <li key={strength}>{strength}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
