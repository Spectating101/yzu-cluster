import { createRoot } from "react-dom/client";
import "./styles/01-foundation.css";
import "./styles/02-components.css";
import "./styles/03-discover-workspace.css";
import "./styles/04-shell.css";
import "./styles/05-synthesis-workstation.css";
import "./styles/06-app-closure.css";
import "./styles/07-discover.css";
import "./styles/08-convergence.css";
import "./styles/09-library.css";
import "./styles/10-preview.css";
import "./styles/11-synthesis-surfaces.css";
import { V2App } from "./App";
import { InteractionProvider } from "./InteractionGuidance";
import { SynthesisAuthorityMount } from "./SynthesisAuthorityMount.jsx";
import { SynthesisObjectContextMount } from "./SynthesisObjectContextMount.jsx";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <InteractionProvider>
      <V2App />
      <SynthesisAuthorityMount />
      <SynthesisObjectContextMount />
    </InteractionProvider>,
  );
}
