import { createRoot } from "react-dom/client";
import "./v2-base.css";
import "./v2.css";
import "@xyflow/react/dist/style.css";
import "./premium.css";
import "./premium-components.css";
import "./premium-profile.css";
import "./premium-synthesis.css";
import "./synthesis-execution.css";
import "./premium-discover-acquisition.css";
import "./premium-fixes.css";
import { V2App } from "./App.jsx";

createRoot(document.getElementById("root")).render(<V2App />);
