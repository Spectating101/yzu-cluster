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
// Profile / Settings refinement stays last so its narrow overrides are easy to
// audit against the canonical HPS authority without touching other surfaces.
import "./profile-settings-canonical-refine.css";
import "./profile-registry-explorer.css";
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
