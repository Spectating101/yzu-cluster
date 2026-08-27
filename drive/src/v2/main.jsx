import "@/lib/browserApiBridge";
import "@/index.css";
import "@/v2/research-drive.css";
import "@/v2/ui-tighten.css";
import "@/v2/release-convergence.css";
import "./library-evidence-rigor.css";
import "./discover-production.css";
import "./discover-visual-freeze.css";
import "./discover-workspace-compression.css";
import "./discover-marketplace-convergence.css";
import "./discover-marketplace-breakpoints.css";
import "./discover-marketplace-detail.css";
import "./discover-product-inspector.css";
import "./hps-shell-convergence.css";
import "./hps-responsive-fixes.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "@/v2/App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
