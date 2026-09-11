import { useEffect, useMemo, useState } from "react";
import { facultyProfile } from "@/v2/api";
import { saveUserEmail } from "@/v2/deskSession";
import {
  clearResearchProfile,
  getResearchProfile,
  saveResearchProfile,
} from "@/v2/researchProfileApi";
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

function explicitDemoMode() {
  try {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

function sameEmail(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function listDraft(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function parseList(value) {
  return [...new Set(
    String(value || "")
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, 20);
}

function draftFromDocument(document) {
  const profile = document?.profile || {};
  return {
    academic_stage: profile.academic_stage || "",
    discipline: profile.discipline || "",
    current_project: profile.current_project || "",
    research_topics: listDraft(profile.research_topics),
    methods: listDraft(profile.methods),
    data_interests: listDraft(profile.data_interests),
  };
}

function PersonalResearchProfile({ document, onDocument, onProfileRefresh }) {
  const [draft, setDraft] = useState(() => draftFromDocument(document));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraft(draftFromDocument(document));
  }, [document]);

  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    setNotice("");
    try {
      const next = await saveResearchProfile({
        academic_stage: draft.academic_stage,
        discipline: draft.discipline,
        current_project: draft.current_project,
        research_topics: parseList(draft.research_topics),
        methods: parseList(draft.methods),
        data_interests: parseList(draft.data_interests),
      });
      onDocument?.(next);
      onProfileRefresh?.();
      setNotice("Research context saved for this account.");
    } catch (error) {
      setNotice(error?.message || "Research context could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    setSaving(true);
    setNotice("");
    try {
      const next = await clearResearchProfile();
      onDocument?.(next);
      onProfileRefresh?.();
      setNotice("Research context cleared. Your signed-in account remains active.");
    } catch (error) {
      setNotice(error?.message || "Research context could not be cleared.");
    } finally {
      setSaving(false);
    }
  };

  const principal = document?.principal || {};
  const configured = Boolean(document?.configured);
  return (
    <>
      <section className="rd-v2-profile-identity" aria-label="Researcher identity" data-testid="personal-research-profile">
        <div className="rd-v2-profile-ident">
          <span className="rd-v2-profile-kicker">Verified researcher</span>
          <h2 className="rd-v2-profile-name">
            {principal.display_name || principal.email?.split("@")[0] || "Researcher"}
          </h2>
          <p className="rd-v2-profile-hint">
            {principal.email || "Verified account"} · Personal research workspace
          </p>
        </div>
        <div className="rd-v2-profile-identity-side">
          <div className="rd-v2-profile-identity-metrics" aria-label="Personal research profile summary">
            <span>
              <strong>{configured ? "Ready" : "New"}</strong>
              <em>research context</em>
            </span>
          </div>
        </div>
      </section>

      <section className="rd-v2-profile-section" data-testid="research-profile-editor" aria-labelledby="research-profile-editor-title">
        <header className="rd-v2-profile-section-head">
          <div>
            <h2 id="research-profile-editor-title">
              {configured ? "Your research context" : "Set up your research context"}
            </h2>
            <p>
              This context helps Ask understand your work. It cannot change your account, role, permissions, or collection authority.
            </p>
          </div>
          <span>{configured ? "User-confirmed" : "Cold start"}</span>
        </header>
        <div className="rd-v2-settings-statement">
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-stage">Academic stage</label>
            <input id="rd-profile-stage" className="rd-v2-input" value={draft.academic_stage} onChange={(event) => patch("academic_stage", event.target.value)} placeholder="e.g. Master's student" />
          </div>
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-discipline">Field / discipline</label>
            <input id="rd-profile-discipline" className="rd-v2-input" value={draft.discipline} onChange={(event) => patch("discipline", event.target.value)} placeholder="e.g. Finance, Marketing, Computer Science" />
          </div>
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-project">What are you working on now?</label>
            <textarea id="rd-profile-project" className="rd-v2-input" rows={3} value={draft.current_project} onChange={(event) => patch("current_project", event.target.value)} placeholder="Describe your thesis, paper, experiment, or current research question." />
          </div>
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-topics">Research topics</label>
            <input id="rd-profile-topics" className="rd-v2-input" value={draft.research_topics} onChange={(event) => patch("research_topics", event.target.value)} placeholder="stablecoins, market liquidity, consumer trust" />
          </div>
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-methods">Methods</label>
            <input id="rd-profile-methods" className="rd-v2-input" value={draft.methods} onChange={(event) => patch("methods", event.target.value)} placeholder="panel regression, survey, SEM" />
          </div>
          <div className="rd-v2-settings-row stack">
            <label className="rd-v2-settings-label" htmlFor="rd-profile-data">Data interests</label>
            <input id="rd-profile-data" className="rd-v2-input" value={draft.data_interests} onChange={(event) => patch("data_interests", event.target.value)} placeholder="transaction data, survey panels, market prices" />
          </div>
          <div className="rd-v2-profile-public-actions">
            <button type="button" className="rd-v2-btn sm primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : configured ? "Save research context" : "Set up research context"}
            </button>
            {configured ? (
              <button type="button" className="rd-v2-btn sm ghost" disabled={saving} onClick={clear}>
                Clear research context
              </button>
            ) : null}
          </div>
          {notice ? <p className="rd-v2-profile-hint" role="status">{notice}</p> : null}
        </div>
      </section>
    </>
  );
}

/**
 * Profile is an epistemic record, not a routing dashboard. Account identity,
 * user-confirmed research context, faculty-registry evidence and Library
 * possession stay separate authorities.
 */
export function ProfilePage({
  profile,
  libraryHoldings = [],
  onGoTab,
  onProfileRefresh,
  allowExamplePreview = false,
}) {
  const [personalDocument, setPersonalDocument] = useState(undefined);
  const [pilot, setPilot] = useState(null);
  const demoMode = explicitDemoMode();

  useEffect(() => {
    let cancelled = false;
    getResearchProfile()
      .then((document) => {
        if (!cancelled) setPersonalDocument(document || null);
      })
      .catch(() => {
        if (!cancelled) setPersonalDocument(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const principalEmail = personalDocument?.principal?.email || "";
  const suppliedProfileBound = Boolean(profile && !profile.unknown);
  const suppliedMatchesPrincipal = !principalEmail || sameEmail(profile?.email, principalEmail);
  const bound = Boolean(suppliedProfileBound && (suppliedMatchesPrincipal || demoMode));
  const shouldLoadExample = Boolean(demoMode && allowExamplePreview && !bound);
  const [pilotLoading, setPilotLoading] = useState(false);

  useEffect(() => {
    if (!shouldLoadExample) {
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
  }, [shouldLoadExample]);

  const previewing = !bound && Boolean(pilot);
  const active = bound ? profile : pilot;
  const signedInResearcher = Boolean(personalDocument?.principal);
  const publicProfile = !signedInResearcher && !active && personalDocument !== undefined && !pilotLoading;
  const surfaceState = resolveSurfaceLifecycle({
    loading: personalDocument === undefined || pilotLoading,
    count: signedInResearcher || active ? 1 : 0,
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
      lead="Account identity, user-confirmed research context, and recorded scholarly evidence"
      surfaceState={surfaceState}
    >
      {signedInResearcher ? (
        <PersonalResearchProfile
          document={personalDocument}
          onDocument={setPersonalDocument}
          onProfileRefresh={onProfileRefresh}
        />
      ) : null}

      {publicProfile ? (
        <section className="rd-v2-profile-public-state" aria-label="Research profile access">
          <span className="rd-v2-profile-kicker">Research identity</span>
          <h2>Profiles are personal workspaces</h2>
          <p>
            Browse the shared Library and Discover as a guest. Sign in to keep a research
            profile, saved reasoning, and a durable research trail.
          </p>
          <div className="rd-v2-profile-public-actions">
            <button type="button" className="rd-v2-btn sm primary" onClick={() => onGoTab?.("browse")}>
              Explore sources
            </button>
            <button type="button" className="rd-v2-btn sm ghost" onClick={() => onGoTab?.("library")}>
              Open Library
            </button>
          </div>
        </section>
      ) : null}

      {active ? (
        <section className="rd-v2-profile-identity" aria-label="Recorded scholarly identity">
          <div className="rd-v2-profile-ident">
            <span className="rd-v2-profile-kicker">Recorded scholarly evidence</span>
            {previewing ? <span className="rd-v2-profile-badge">Example</span> : null}
            <h2 className="rd-v2-profile-name">{name}</h2>
            {orgLine ? <p className="rd-v2-profile-org">{orgLine}</p> : null}
            <p className="rd-v2-profile-hint">
              {email || "—"}
              {previewing ? " · Example · pilot faculty" : ""}
              {active ? " · Source · faculty registry" : ""}
            </p>
          </div>
          <div className="rd-v2-profile-identity-side">
            <div className="rd-v2-profile-identity-metrics" aria-label="Researcher record summary">
              {paperCount ? <span><strong>{paperCount}</strong><em>indexed works</em></span> : null}
              {memory.length ? <span><strong>{memory.length}</strong><em>context fields</em></span> : null}
              {relationships.length ? <span><strong>{heldRelationships}/{relationships.length}</strong><em>links held</em></span> : null}
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
            ) : null}
          </div>
        </section>
      ) : null}

      {pilotLoading ? <p className="rd-v2-profile-loading">Loading example profile…</p> : null}

      {active && memory.length ? (
        <section className="rd-v2-profile-section rd-v2-profile-memory-section" data-testid="profile-memory" aria-labelledby="profile-memory-title">
          <header className="rd-v2-profile-section-head">
            <div>
              <h2 id="profile-memory-title">Research context on record</h2>
              <p>Recorded scholarly context is evidence, not account identity and not a claim that every workflow uses every field.</p>
            </div>
            <span>Registry-backed</span>
          </header>
          <div className="rd-v2-profile-memory-layout">
            <ul className="rd-v2-profile-memory">
              {savedMemory.map((card) => (
                <li key={card.id} className="rd-v2-profile-memory-card" data-memory={card.id}>
                  <span>{memoryLabel(card)}</span>
                  <strong>{memoryText(card, card.id === "also" ? "Also" : card.id === "methods" ? "Methods" : "Focus")}</strong>
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
            <div><h2>Research context on record</h2><p>Thin registry records stay thin rather than inventing researcher context.</p></div>
            <span>Registry-backed</span>
          </header>
          <p className="rd-v2-empty-inline">No specialties, methods, or current research direction are recorded.</p>
        </section>
      ) : null}

      {active && (works.items.length || works.paperCount) ? (
        <section className="rd-v2-profile-section rd-v2-profile-works-section" data-testid="profile-works" aria-labelledby="profile-works-title">
          <header className="rd-v2-profile-section-head">
            <div><h2 id="profile-works-title">Works</h2><p>Indexed publication information retained in the faculty record.</p></div>
            {works.paperCount ? <span>{works.paperCount} indexed</span> : null}
          </header>
          {works.items.length ? (
            <ol className="rd-v2-profile-works">
              {works.items.map((work, index) => <li key={work.raw}><span>{String(index + 1).padStart(2, "0")}</span><strong>{work.title}</strong></li>)}
            </ol>
          ) : <p className="rd-v2-empty-inline">Indexed count on file; highlights not listed.</p>}
        </section>
      ) : null}

      {active ? (
        <section className="rd-v2-profile-section rd-v2-profile-lab-section" data-testid="profile-lab" aria-labelledby="profile-lab-title">
          <header className="rd-v2-profile-section-head">
            <div>
              <h2 id="profile-lab-title">Research evidence relationships</h2>
              <p>Recorded relationships are reconciled against the current Library. Library—not Profile—is possession authority.</p>
            </div>
            <span>{heldRelationships} held · {relationships.length} recorded</span>
          </header>
          {relationships.length ? (
            <ul className="rd-v2-profile-lab-rows">
              {relationships.map((row) => (
                <li key={row.id}>
                  <span className="rd-v2-profile-lab-title" title={row.label}>{row.label}<em> — {row.routeLabel}</em></span>
                  <span className="rd-v2-profile-lab-action" data-held={row.held ? "true" : "false"}>{row.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="rd-v2-empty-inline">No evidence relationships are recorded for this researcher.</p>}
          <p className="rd-v2-profile-memory-effect" data-testid="profile-suggestion-boundary">
            Suggested evidence belongs to Home and Discover. A recommendation is not a researcher fact and is not part of this profile.
          </p>
        </section>
      ) : null}
    </PageShell>
  );
}

/** DETAIL rail for Profile: account identity first, registry evidence second. */
export function ProfileDetailPanel({ profile, allowExamplePreview = false }) {
  const [personalDocument, setPersonalDocument] = useState(undefined);
  const [pilot, setPilot] = useState(null);
  const demoMode = explicitDemoMode();

  useEffect(() => {
    let cancelled = false;
    getResearchProfile()
      .then((document) => {
        if (!cancelled) setPersonalDocument(document || null);
      })
      .catch(() => {
        if (!cancelled) setPersonalDocument(null);
      });
    return () => { cancelled = true; };
  }, []);

  const principalEmail = personalDocument?.principal?.email || "";
  const suppliedBound = Boolean(profile && !profile.unknown);
  const bound = Boolean(suppliedBound && (!principalEmail || sameEmail(profile?.email, principalEmail) || demoMode));

  useEffect(() => {
    if (bound || !demoMode || !allowExamplePreview) {
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
    return () => { cancelled = true; };
  }, [bound, demoMode, allowExamplePreview]);

  if (personalDocument?.principal) {
    const principal = personalDocument.principal;
    const context = personalDocument.profile || {};
    const contextBits = [
      context.current_project,
      ...(context.research_topics || []),
      ...(context.methods || []),
    ].filter(Boolean).slice(0, 5);
    return (
      <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-block">
          <h3>Researcher</h3>
          <p>{principal.display_name || principal.email || "Verified researcher"}</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Current context</h3>
          <p>{contextBits.length ? contextBits.join(" · ") : "Not set up yet. Add research context in Profile."}</p>
        </section>
        <section className="rd-v2-profile-rail-block">
          <h3>Record source</h3>
          <p>Verified account · user-confirmed research context</p>
        </section>
      </div>
    );
  }

  const previewing = !bound && Boolean(pilot);
  const active = bound ? profile : pilot;
  const read = buildDeskRead(active, { previewing });
  if (!active) {
    return (
      <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
        <p className="rd-v2-empty-inline">Sign in to keep a personal research profile.</p>
      </div>
    );
  }
  return (
    <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
      <section className="rd-v2-profile-rail-block"><h3>Scholar</h3><p>{read.scholar}</p></section>
      {read.strengths.length ? (
        <section className="rd-v2-profile-rail-block"><h3>Registry strengths</h3><ul>{read.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul></section>
      ) : null}
      <section className="rd-v2-profile-rail-block"><h3>Record source</h3><p>Faculty registry{active.email ? ` · ${active.email}` : ""}. Library separately confirms evidence possession.</p></section>
    </div>
  );
}
