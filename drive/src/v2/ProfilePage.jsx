import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/v2/ui";
import {
  countSignals,
  fallbackProfilePortrait,
  generateProfilePortrait,
  profilePortraitKey,
  profilePortraitSource,
  readCachedProfilePortrait,
} from "@/v2/profilePortrait";

function initials(value) {
  const words = String(value || "Researcher")
    .replace(/[,._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "R";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

function listField(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function humanTag(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMl\b/g, "ML")
    .replace(/\bNft\b/g, "NFT");
}

function holdingIds(rows = []) {
  const ids = new Set();
  for (const row of rows || []) {
    const id = String(row?.dataset_id || row?.id || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

function evidenceRelationships(profile, libraryHoldings) {
  const held = holdingIds(libraryHoldings);
  return (profile?.lab_fintech_stack || [])
    .filter((item) => item && (item.label || item.id))
    .map((item) => {
      const ids = (item.registry_dataset_ids || []).map((id) => String(id || "").trim()).filter(Boolean);
      const isHeld = ids.some((id) => held.has(id));
      return {
        id: item.id || item.partition_id || item.label,
        label: item.label || item.id || "Evidence relationship",
        route: String(item.route || "vault").toLowerCase(),
        isHeld,
        status: isHeld ? "Held in Library" : "Recorded relationship",
      };
    });
}

const PROJECT_SURFACES = [
  ["discover", "Discover", "Find and inspect research material before deciding what belongs in the workspace."],
  ["library", "Library", "Keep evidence and provenance as durable, inspectable research holdings."],
  ["synthesis", "Synthesis", "Work from selected evidence while keeping source boundaries visible."],
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
        <header><h3 id="profile-about-title">About Research Drive</h3></header>
        <p className="rd-v2-profile-section-copy">
          Research Drive helps you discover, organize, inspect, and work from scholarly material without losing the evidence trail behind the work.
        </p>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-capabilities-title">
        <header><h3 id="profile-capabilities-title">What it does</h3></header>
        <div className="rd-v2-profile-simple-list">
          {PROJECT_SURFACES.map(([id, title, copy]) => (
            <SettingLikeRow
              key={id}
              label={title}
              copy={copy}
              action={<button type="button" className="rd-v2-profile-row-action" onClick={() => onGoTab?.(id)}>Open</button>}
            />
          ))}
        </div>
      </section>

      <section className="rd-v2-profile-simple-section" aria-labelledby="profile-principles-title">
        <header><h3 id="profile-principles-title">How it handles research</h3></header>
        <div className="rd-v2-profile-simple-list">
          {PROJECT_PRINCIPLES.map(([label, copy]) => <SettingLikeRow key={label} label={label} copy={copy} />)}
        </div>
      </section>

      <section className="rd-v2-profile-simple-section rd-v2-profile-signin-note" aria-labelledby="profile-signin-title">
        <header><h3 id="profile-signin-title">When you sign in</h3></header>
        <p className="rd-v2-profile-section-copy">
          Profile becomes an AI-assisted research portrait grounded in your recorded research context, works, and the evidence this workspace can actually verify.
        </p>
      </section>
    </div>
  );
}

function PortraitColumn({ title, items, empty }) {
  return (
    <section className="rd-v2-profile-portrait-column">
      <h4>{title}</h4>
      <div className="rd-v2-profile-portrait-list">
        {items?.length ? items.map((item, index) => (
          <article key={`${item.label}-${index}`} className="rd-v2-profile-portrait-item">
            <strong>{item.label}</strong>
            {item.read ? <p>{item.read}</p> : null}
            {item.basis?.length ? <small>Grounded in {item.basis.join(" · ")}</small> : null}
          </article>
        )) : <p className="rd-v2-profile-portrait-empty">{empty}</p>}
      </div>
    </section>
  );
}

function UserResearchProfile({ profile, libraryHoldings = [], onGoTab }) {
  const name = profile?.name_en || profile?.name || "Researcher";
  const orgLine = [profile?.title, profile?.discipline].filter(Boolean).join(" · ");
  const email = profile?.email || "";
  const source = useMemo(() => profilePortraitSource(profile, libraryHoldings), [profile, libraryHoldings]);
  const sourceKey = useMemo(() => profilePortraitKey(source), [source]);
  const fallback = useMemo(() => fallbackProfilePortrait(source), [source]);
  const [portrait, setPortrait] = useState(() => readCachedProfilePortrait(source) || fallback);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const relationships = useMemo(() => evidenceRelationships(profile, libraryHoldings), [profile, libraryHoldings]);
  const specialties = listField(profile?.specialties);
  const methods = listField(profile?.method_tags?.length ? profile.method_tags : profile?.methods).map(humanTag);
  const researchTracks = listField(profile?.research_tracks)
    .map((track) => typeof track === "string" ? track : track?.title || track?.name)
    .filter(Boolean);
  const recordedSignals = countSignals(source);

  const refreshPortrait = useCallback(async () => {
    setPortraitBusy(true);
    setPortraitError("");
    try {
      const next = await generateProfilePortrait(profile, libraryHoldings);
      if (next) setPortrait(next);
    } catch (error) {
      setPortrait(fallback);
      setPortraitError(error?.message || "AI portrait unavailable");
    } finally {
      setPortraitBusy(false);
    }
  }, [profile, libraryHoldings, fallback]);

  useEffect(() => {
    let live = true;
    const cached = readCachedProfilePortrait(source);
    if (cached) {
      setPortrait(cached);
      setPortraitError("");
      return () => { live = false; };
    }
    setPortrait(fallback);
    setPortraitBusy(true);
    setPortraitError("");
    generateProfilePortrait(profile, libraryHoldings)
      .then((next) => { if (live && next) setPortrait(next); })
      .catch((error) => {
        if (!live) return;
        setPortrait(fallback);
        setPortraitError(error?.message || "AI portrait unavailable");
      })
      .finally(() => { if (live) setPortraitBusy(false); });
    return () => { live = false; };
  }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = portraitBusy ? "Synthesizing…" : portrait?.generated ? "AI synthesized" : "Recorded facts only";
  const evidenceHeld = relationships.filter((row) => row.isHeld).length;
  const paperCount = Number(profile?.paper_count_parsed || profile?.paper_count || 0) || 0;

  return (
    <div className="rd-v2-profile-personalization rd-v2-profile-about-user rd-v2-profile-ai-native">
      <section className="rd-v2-profile-about-header" aria-label="About you">
        <div className="rd-v2-profile-avatar">{initials(name)}</div>
        <div className="rd-v2-profile-about-copy">
          <span>Research profile</span>
          <h2>{name}</h2>
          <p>{orgLine || "Researcher"}</p>
          {email ? <small>{email}</small> : null}
        </div>
        <button type="button" className="rd-v2-btn sm ghost rd-v2-profile-manage" onClick={() => onGoTab?.("settings")}>
          Manage
        </button>
      </section>

      <section className="rd-v2-profile-ai-portrait" data-testid="profile-ai-portrait" aria-labelledby="profile-portrait-title">
        <div className="rd-v2-profile-ai-portrait-head">
          <div>
            <span className="rd-v2-profile-ai-kicker">AI research portrait</span>
            <h3 id="profile-portrait-title">{portrait?.headline || "Research profile"}</h3>
          </div>
          <div className="rd-v2-profile-ai-actions">
            <span className={`rd-v2-profile-ai-state${portrait?.generated ? " is-generated" : ""}`}>{status}</span>
            <button type="button" className="rd-v2-btn sm ghost" disabled={portraitBusy} onClick={refreshPortrait}>
              {portraitBusy ? "Reading…" : "Refresh portrait"}
            </button>
          </div>
        </div>
        <p className="rd-v2-profile-ai-overview">{portrait?.overview}</p>
        <div className="rd-v2-profile-ai-grounding">
          <span>{portrait?.source_count || recordedSignals} grounded signals</span>
          <span>{paperCount ? `${paperCount} works indexed` : "Works count not established"}</span>
          <span>{libraryHoldings.length} Library holdings visible</span>
        </div>
        {portraitError ? (
          <p className="rd-v2-profile-ai-warning">AI synthesis is unavailable right now. The page is showing recorded facts without inventing the missing interpretation.</p>
        ) : null}
      </section>

      <section className="rd-v2-profile-map-section" aria-labelledby="profile-map-title">
        <header className="rd-v2-profile-section-heading">
          <div>
            <h3 id="profile-map-title">How your research hangs together</h3>
            <p>Model interpretation is separated from the source fields that ground it.</p>
          </div>
        </header>
        <div className="rd-v2-profile-portrait-grid">
          <PortraitColumn title="Research themes" items={portrait?.themes} empty="No defensible theme can be synthesized from the current record yet." />
          <PortraitColumn title="Methods & lenses" items={portrait?.methods} empty="Methods are not established in the current record." />
          <PortraitColumn title="Cross-cutting connections" items={portrait?.connections} empty="More grounded material is needed before Research Drive can infer cross-cutting connections." />
        </div>
      </section>

      <section className="rd-v2-profile-work-evidence" aria-labelledby="profile-work-evidence-title">
        <header className="rd-v2-profile-section-heading">
          <div>
            <h3 id="profile-work-evidence-title">Works & evidence</h3>
            <p>The interpretive layer sits beside the records that can actually be inspected.</p>
          </div>
        </header>
        <div className="rd-v2-profile-work-evidence-grid">
          <div className="rd-v2-profile-evidence-pane" data-testid="profile-works">
            <div className="rd-v2-profile-pane-head">
              <h4>Selected works</h4>
              <span>{paperCount ? `${paperCount} indexed` : "Count unknown"}</span>
            </div>
            {portrait?.works?.length ? portrait.works.map((work, index) => (
              <article key={`${work.label}-${index}`} className="rd-v2-profile-work-read">
                <strong>{work.label}</strong>
                {work.read ? <p>{work.read}</p> : null}
              </article>
            )) : (
              <p className="rd-v2-profile-pane-empty">No publication highlights are available to interpret yet.</p>
            )}
          </div>

          <div className="rd-v2-profile-evidence-pane" data-testid="profile-lab">
            <div className="rd-v2-profile-pane-head">
              <h4>Evidence relationships</h4>
              <span>{evidenceHeld}/{relationships.length} held</span>
            </div>
            {relationships.length ? relationships.map((row) => (
              <div key={row.id} className="rd-v2-profile-evidence-row">
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.route === "bigquery" ? "BigQuery relationship" : "Vault relationship"}</small>
                </div>
                <span data-held={row.isHeld ? "true" : "false"}>{row.status}</span>
              </div>
            )) : (
              <p className="rd-v2-profile-pane-empty">No explicit profile-to-evidence relationships are recorded yet.</p>
            )}
            <p className="rd-v2-profile-evidence-read">{portrait?.evidence_read}</p>
          </div>
        </div>
      </section>

      <section className="rd-v2-profile-recorded" data-testid="profile-recorded-facts" aria-labelledby="profile-recorded-title">
        <header className="rd-v2-profile-section-heading">
          <div>
            <h3 id="profile-recorded-title">Recorded facts</h3>
            <p>The source layer beneath the AI portrait. These fields are not model inference.</p>
          </div>
        </header>
        <div className="rd-v2-profile-recorded-grid">
          <SettingLikeRow label="Research focus" copy={profile?.current_research || "Not recorded yet."} />
          <SettingLikeRow label="Specialties" copy={specialties.length ? specialties.join(" · ") : "Not recorded yet."} />
          <SettingLikeRow label="Methods" copy={methods.length ? methods.join(" · ") : "Not recorded yet."} />
          <SettingLikeRow label="Research tracks" copy={researchTracks.length ? researchTracks.join(" · ") : "Not recorded yet."} />
        </div>
        {portrait?.unknowns?.length ? (
          <div className="rd-v2-profile-unknowns">
            <strong>Not established by the current evidence</strong>
            <p>{portrait.unknowns.join(" · ")}</p>
          </div>
        ) : null}
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
        ? "An AI-assisted portrait of your research, grounded in the profile and evidence Research Drive can actually inspect."
        : "About Research Drive and the evidence principles behind the workspace."}
      surfaceState="ready"
    >
      {signedIn ? (
        <UserResearchProfile profile={profile} libraryHoldings={libraryHoldings} onGoTab={onGoTab} />
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

  const specialties = listField(profile?.specialties);
  const methods = listField(profile?.method_tags?.length ? profile.method_tags : profile?.methods);
  const workCount = Number(profile?.paper_count_parsed || profile?.paper_count || 0) || 0;
  const linkCount = (profile?.lab_fintech_stack || []).length;

  return (
    <div className="rd-v2-profile-rail" data-testid="profile-detail-rail">
      <section className="rd-v2-profile-rail-block">
        <h3>Portrait boundary</h3>
        <p>AI may synthesize patterns across the recorded profile, but it cannot promote inference into a researcher fact.</p>
      </section>
      <section className="rd-v2-profile-rail-block">
        <h3>Grounding available</h3>
        <ul>
          <li>{specialties.length} recorded specialties</li>
          <li>{methods.length} recorded methods</li>
          <li>{workCount || "No"} indexed works</li>
          <li>{linkCount} recorded evidence relationships</li>
        </ul>
      </section>
      <section className="rd-v2-profile-rail-block">
        <h3>Authority</h3>
        <p>Registry fields remain explicit facts. Library remains authoritative for evidence actually held by this workspace.</p>
      </section>
    </div>
  );
}
