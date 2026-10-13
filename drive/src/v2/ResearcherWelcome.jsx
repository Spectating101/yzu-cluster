import { useEffect, useState } from "react";
import { getResearchProfile } from "./researchProfileApi.js";
import "./accounts.css";

export function ResearcherWelcome({ deskAccess, onGoTab }) {
  const actor = deskAccess?.principal;
  const eligible = actor?.role === "public_member" || actor?.role === "member";
  const key = `rd.welcome:${actor?.id || ""}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!eligible) return undefined;
    try { if (localStorage.getItem(key)) return undefined; } catch { /* ignore */ }
    let current = true;
    getResearchProfile().then((out) => { if (current) setShow(!out.configured); }).catch(() => {});
    return () => { current = false; };
  }, [eligible, key]);
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
    setShow(false);
  };
  return <section className="rd-account-welcome" aria-labelledby="rd-welcome-title">
    <h2 id="rd-welcome-title">Welcome, {actor.display_name || "researcher"}</h2>
    <p>Start with evidence in Library, find additional sources in Discover, or use Ask to investigate a question. Your research trail belongs to your account.</p>
    <p>Adding your topic and methods in Profile helps the desk tailor its suggestions. You can start without filling it in.</p>
    <div className="rd-account-actions">
      <button type="button" className="rd-v2-btn sm primary" onClick={() => onGoTab("profile")}>Set up my research context</button>
      <button type="button" className="rd-v2-btn sm ghost" onClick={() => { dismiss(); onGoTab("library"); }}>Start with Library</button>
      <button type="button" className="rd-v2-btn sm ghost" onClick={dismiss}>Dismiss welcome</button>
    </div>
  </section>;
}
