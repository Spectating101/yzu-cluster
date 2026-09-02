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
import "./synthesis-wide-workstation.css";
import "./synthesis-wide-workstation-closure.css";
import "./synthesis-wide-workstation-sanding.css";
import "./synthesis-wide-workstation-sanding-final.css";
import "./synthesis-wide-shell-canvas.css";
import "./synthesis-wide-brief-ledger.css";
import "./synthesis-operation-truth.css";
import "./synthesis-operated-flow.css";
import "./synthesis-operated-flow-final.css";
import "./synthesis-zero-instruction.css";
import "./synthesis-zero-instruction-contract.css";
import "./synthesis-zero-instruction-visual-closure.css";
import "./discover-frozen-closure.css";
import "./connected-accounts.css";
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
