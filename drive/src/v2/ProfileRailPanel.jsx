import {
  RailDecisionSummary,
  RailEntityHeader,
  RailField,
  RailFieldGrid,
  RailFrame,
  RailStickyFooter,
} from "@/v2/RailFrame";

function listField(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function goToTab(tab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.location.assign(url.toString());
}

function countRecordedSignals(profile) {
  const specialties = listField(profile?.specialties).length;
  const methods = listField(profile?.method_tags?.length ? profile.method_tags : profile?.methods).length;
  const tracks = listField(profile?.research_tracks).length;
  const focus = profile?.current_research || profile?.research_direction ? 1 : 0;
  return specialties + methods + tracks + focus;
}

function GuestProfileRail({ onAskAbout }) {
  return (
    <RailFrame>
      <RailEntityHeader
        id="profile-project"
        title="Research Drive"
        description="Profile is in project mode because no researcher context is connected to this desk."
        pills={<span className="rd-v2-pill warn">Project profile</span>}
      />
      <RailDecisionSummary
        status="No researcher context in use"
        primary="This page describes the workspace rather than pretending to know who the researcher is."
        risk="No personalized research direction"
        next="Connect a research profile when you want this page to become yours"
      />
      <div className="rd-v2-rail-scroll rd-v2-profile-operational-rail-scroll" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-module">
          <p className="rd-v2-rail-section-label">Workspace loop</p>
          <RailFieldGrid>
            <RailField label="Discover" value="Find and inspect material" />
            <RailField label="Library" value="Retain evidence with provenance" />
            <RailField label="Synthesis" value="Work from selected evidence" />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-profile-rail-module">
          <p className="rd-v2-rail-section-label">When connected</p>
          <RailFieldGrid>
            <RailField label="Context" value="Explicit research themes, methods, works, and affiliation" />
            <RailField label="Portrait" value="AI synthesis grounded in recorded profile signals" />
            <RailField label="Direction" value="Context can steer organization and recommendations" />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-profile-rail-module rd-v2-profile-rail-wide-only">
          <p className="rd-v2-rail-section-label">Evidence contract</p>
          <RailFieldGrid>
            <RailField label="Facts" value="Recorded researcher fields stay explicit" />
            <RailField label="Inference" value="AI interpretation stays visibly separate" />
            <RailField label="Possession" value="Library remains authoritative for held evidence" />
          </RailFieldGrid>
        </section>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => goToTab("settings")}>
          Connect research profile
        </button>
        <button type="button" className="rd-v2-btn sm" onClick={() => goToTab("browse")}>
          Explore Discover →
        </button>
        {onAskAbout ? (
          <button type="button" className="rd-v2-btn sm ghost" onClick={() => onAskAbout?.()}>
            Ask about Profile
          </button>
        ) : null}
      </RailStickyFooter>
    </RailFrame>
  );
}

function UserProfileRail({ profile, onAskAbout }) {
  const name = profile?.name_en || profile?.name || "Researcher";
  const orgLine = [profile?.title, profile?.discipline].filter(Boolean).join(" · ") || "Research profile";
  const specialties = listField(profile?.specialties);
  const methods = listField(profile?.method_tags?.length ? profile.method_tags : profile?.methods);
  const workCount = Number(profile?.paper_count_parsed || profile?.paper_count || 0) || 0;
  const relationshipCount = (profile?.lab_fintech_stack || []).filter((item) => item && (item.label || item.id)).length;
  const recordedSignals = countRecordedSignals(profile);
  const sparse = recordedSignals === 0 && workCount === 0 && relationshipCount === 0;

  return (
    <RailFrame>
      <RailEntityHeader
        id="profile-researcher"
        title={name}
        description={orgLine}
        pills={<span className={`rd-v2-pill${sparse ? " warn" : ""}`}>{sparse ? "Sparse context" : "Research context"}</span>}
      />
      <RailDecisionSummary
        status={sparse ? "Research profile connected, context sparse" : "Grounded research profile available"}
        primary={sparse
          ? "Identity is explicit, but the current record does not yet establish enough research context for a rich portrait."
          : `${recordedSignals} explicit research-context signals and ${workCount || "no confirmed"} indexed works are available to ground the portrait.`}
        risk="Inference remains separate from source facts"
        next={sparse ? "Add or correct research context in Settings" : "Use this portrait as context, not as evidence"}
      />
      <div className="rd-v2-rail-scroll rd-v2-profile-operational-rail-scroll" data-testid="profile-detail-rail">
        <section className="rd-v2-profile-rail-module">
          <p className="rd-v2-rail-section-label">Grounding available</p>
          <RailFieldGrid>
            <RailField label="Specialties" value={`${specialties.length} recorded`} />
            <RailField label="Methods" value={`${methods.length} recorded`} />
            <RailField label="Works" value={workCount ? `${workCount} indexed` : "Count not established"} />
            <RailField label="Evidence links" value={`${relationshipCount} recorded`} />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-profile-rail-module">
          <p className="rd-v2-rail-section-label">Authority</p>
          <RailFieldGrid>
            <RailField label="Profile fields" value="Explicit researcher facts" />
            <RailField label="AI portrait" value="Interpretive synthesis" />
            <RailField label="Library" value="Authority for evidence actually held" />
          </RailFieldGrid>
        </section>

        <section className="rd-v2-profile-rail-module rd-v2-profile-rail-wide-only">
          <p className="rd-v2-rail-section-label">Workspace effect</p>
          <RailFieldGrid>
            <RailField label="Direction" value={profile?.current_research || profile?.research_direction || "No explicit research direction recorded"} />
            <RailField label="Use" value="Organization and recommendations may use explicit profile context" />
            <RailField label="Boundary" value="Research context does not become evidence" />
          </RailFieldGrid>
        </section>
      </div>
      <RailStickyFooter>
        <button type="button" className="rd-v2-btn sm primary" onClick={() => goToTab("settings")}>
          Manage research profile
        </button>
        {onAskAbout ? (
          <button type="button" className="rd-v2-btn sm" onClick={() => onAskAbout?.()}>
            Ask about this portrait →
          </button>
        ) : null}
      </RailStickyFooter>
    </RailFrame>
  );
}

export function ProfileRailPanel({ profile, onAskAbout }) {
  const signedIn = Boolean(profile && !profile.unknown);
  return signedIn ? (
    <UserProfileRail profile={profile} onAskAbout={onAskAbout} />
  ) : (
    <GuestProfileRail onAskAbout={onAskAbout} />
  );
}
