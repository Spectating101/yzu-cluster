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
import "./rc3-semantic.css";
import "./rc3-visual-fixes.css";
import "./rc3-recovery-links.css";
import "./live-convergence.css";
import "./live-convergence-fixes.css";
import "./live-convergence-loop2.css";
import "./live-convergence-loop2-fixes.css";
// Desktop workbench layers are the final visual authority at wide viewports.
import "./desktop-workbench.css";
import "./desktop-workbench-fixes.css";
// Loop 7 turns Synthesis into a structured research construction.
import "./synthesis-loop7.css";
import "./synthesis-loop7-fixes.css";
// Isolated Sol-ceiling experiment. Desktop-only and presentation-only until
// exact-SHA capture proves it materially improves the accepted workbench.
import "./sol-ceiling.css";
import { InteractionProvider } from "./InteractionGuidance.jsx";
import { V2App } from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <InteractionProvider>
    <V2App />
  </InteractionProvider>,
);
