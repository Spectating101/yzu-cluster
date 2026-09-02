import { createRoot } from "react-dom/client";
import "./v2-base.css";
import "./v2.css";
import "./premium.css";
import "./premium-components.css";
import "./premium-profile.css";
import "./premium-synthesis.css";
import "./premium-fixes.css";
import "./synthesis-s04-review.css";
import "./release-visual.css";
import "./release-mobile-fixes.css";
import "./interaction-guidance.css";
import "./interaction-feedback.css";
import "./decoration-layer.css";
import "./release-scale.css";
import "./library-workspace.css";
import "./library-inspector-density.css";
import "./discover-visual-freeze.css";
import "./discover-workspace-compression.css";
import "./discover-marketplace-convergence.css";
import "./discover-marketplace-detail.css";
import "./discover-marketplace-breakpoints.css";
import "./discover-product-inspector.css";
import "./hps-shell-convergence.css";
import "./hps-responsive-fixes.css";
import "./synthesis-workstation.css";
import "./discover-frozen-closure.css";
import "./connected-accounts.css";
// DiscoverCoveragePanel imports this component stylesheet as well, but loading
// it here establishes one deterministic root order for the final overrides.
import "./discover-production.css";
import "./visual-hardening.css";
// HOME-DESKTOP-V1-2026-09-01 is explicit visual authority. Keep it after
// general hardening so broad surface CSS cannot silently recompose Home.
import "./home-authority.css";
// Containment is part of the authority: no nested prompt/action may bleed
// beyond the Home card that owns it at any certified desktop viewport.
import "./home-authority-closure.css";
// Selected Home attention must read as a continuation of Pick Up, not as a
// generic inspector explainer detached from the actual decision record.
import "./home-attention-rail.css";
// Final screenshot sanding: remove the redundant page label and close the
// unnecessary centre-to-inspector gutter without disturbing 1440 geometry.
import "./home-final-sanding.css";
// Recent Trail must adapt to variable production workload volume instead of
// being composed around a fixed four-row screenshot fixture.
import "./home-trail-adaptive.css";
// Profile / Settings is the only active visual workstream on this branch.
// Keep these overrides last so PS can be judged against the current canonical
// shell without importing unrelated surface experiments.
import "./profile-settings-canonical-refine.css";
import "./profile-registry-explorer.css";
import "./profile-settings-final-polish.css";
import "./profile-settings-workstation.css";
// Profile and Settings use the quiet personalization / category-row grammar of
// modern assistant account surfaces rather than another product dashboard.
import "./profile-settings-personalization.css";
import "./profile-settings-personalization-polish.css";
// Signed-in Profile adds an AI-generated research portrait while preserving a
// visible boundary between model interpretation and recorded evidence.
import "./profile-ai-portrait.css";
// Final density pass: preserve the AI-native hierarchy while removing the
// cumulative vertical gaps visible in the 1440/1920 acceptance frames.
import "./profile-ai-portrait-tightening.css";
// Guest Profile is Research Drive's own guided product profile: explain the
// research loop, workspace scope, and evidence contract without dashboard UI.
import "./profile-guest-guide.css";
// Settings stays a compact control plane on both desktop targets. Load this
// last so wide-screen rules cannot silently re-inflate ordinary setting rows.
import "./settings-density-rail-polish.css";
// Profile's rail is a live context/authority surface, with wide-screen-only
// enrichment where the 1920 viewport can genuinely use the additional room.
import "./profile-rail-operational.css";
// PS owns its internal hierarchy now; remove the generic page inset and the
// last duplicated section/rail gaps without shrinking type or control targets.
import "./profile-settings-gap-tightening.css";
import { V2App } from "./App";
import { InteractionProvider } from "./InteractionGuidance";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <InteractionProvider>
      <V2App />
    </InteractionProvider>,
  );
}
