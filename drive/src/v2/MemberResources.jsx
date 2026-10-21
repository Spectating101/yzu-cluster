import { useEffect, useState } from "react";
import { accountUsage } from "./accountApi.js";
import { requestCounts } from "./requestCounts.js";
import { ReachAbilities, ReachSources, useReach } from "./ResourcesReach.jsx";

export function requestSummary(counts) {
  const parts = [
    counts.waiting ? `${counts.waiting} waiting` : "",
    counts.running ? `${counts.running} collecting` : "",
    counts.ready ? `${counts.ready} ready` : "",
    counts.failed ? `${counts.failed} failed` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "None yet";
}

function AssistantUse({ usage, usageError }) {
  if (usageError) return <><strong>Allowance unavailable</strong><span>Browsing and downloads are not affected.</span></>;
  if (!usage) return <><strong>Reading allowance…</strong><span>Ask and coverage checks use it; browsing never does.</span></>;
  const daily = usage.limits.daily_requests;
  return (
    <>
      <strong>{usage.hourly_remaining} of {usage.limits.hourly_requests} left this hour</strong>
      <span>{usage.daily_remaining} of {daily} today · browsing never uses it</span>
      <meter min={0} max={daily} value={usage.daily_remaining} aria-label="Assistant requests left today" />
    </>
  );
}

export function MemberResources({ signedIn, licensedOpen = false, jobs, onGoTab, onOpenHistory, onSignIn }) {
  const { reach } = useReach();
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState("");
  useEffect(() => {
    if (!signedIn) return undefined;
    let current = true;
    accountUsage().then((out) => { if (current) setUsage(out); }).catch((e) => { if (current) setUsageError(e.message); });
    return () => { current = false; };
  }, [signedIn]);
  const counts = requestCounts(jobs);

  if (!signedIn) {
    return (
      <>
        <section className="rd-v2-reach-hero">
          <div>
            <h2>Everything Research Drive can reach</h2>
            <p>Browsing, previews and downloads of open data need no account. A padlock marks what needs one, or a Yuan Ze email.</p>
          </div>
          <div className="rd-v2-member-resources-actions">
            {onSignIn ? <button type="button" className="rd-v2-btn primary" onClick={onSignIn}>Sign in</button> : null}
            <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("library")}>Browse the Library</button>
          </div>
        </section>
        <ReachAbilities signedIn={false} licensedOpen={false} />
        <ReachSources reach={reach} licensedOpen={false} />
      </>
    );
  }

  return (
    <>
      <section className="rd-v2-usage" data-testid="member-resources" aria-label="Your access and use">
        <div>
          <span className="rd-v2-eyebrow">Research assistant</span>
          <AssistantUse usage={usage} usageError={usageError} />
        </div>
        <div>
          <span className="rd-v2-eyebrow">Your collection requests</span>
          <strong>{requestSummary(counts)}</strong>
          <span>{counts.waiting || counts.running ? "A research operator approves each request." : "Nothing waiting or collecting."}</span>
          <button type="button" className="rd-v2-linkish" onClick={onOpenHistory}>Request history →</button>
        </div>
        <div>
          <span className="rd-v2-eyebrow">Access</span>
          <ReachAbilities signedIn licensedOpen={licensedOpen} compact onSignIn={onSignIn} />
        </div>
      </section>
      <ReachSources reach={reach} licensedOpen={licensedOpen} />
    </>
  );
}
