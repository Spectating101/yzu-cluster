import { useEffect, useState } from "react";
import { accountUsage } from "./accountApi.js";
import { requestCounts } from "./requestCounts.js";

export function MemberResources({ signedIn, jobs, libraryCount, onGoTab, onOpenHistory, onSignIn }) {
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
      <section className="rd-v2-guest-feature-hero">
        <span className="rd-v2-eyebrow">Resources</span>
        <h2>Your allowance and requests appear here after you sign in</h2>
        <p>Signed-in researchers see how much of the research assistant they have left and how their collection requests are progressing. The shared Library and Discover stay open to everyone.</p>
        <div className="rd-v2-member-resources-actions">
          {onSignIn ? <button type="button" className="rd-v2-btn primary" onClick={onSignIn}>Sign in</button> : null}
          <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("library")}>Browse the Library</button>
        </div>
      </section>
    );
  }

  return (
    <div className="rd-v2-member-resources" data-testid="member-resources">
      <article>
        <span className="rd-v2-eyebrow">Research assistant</span>
        <h2>{usage ? `${usage.hourly_remaining} of ${usage.limits.hourly_requests} left this hour` : usageError ? "Allowance unavailable" : "Reading allowance…"}</h2>
        <p>{usage ? `${usage.daily_remaining} of ${usage.limits.daily_requests} left in the last 24 hours. Browsing never uses it.` : usageError || "Ask, coverage checks and advice use this allowance."}</p>
      </article>
      <article>
        <span className="rd-v2-eyebrow">Your collection requests</span>
        <h2>{counts.waiting ? `${counts.waiting} waiting for approval` : counts.running ? `${counts.running} collecting now` : "Nothing in progress"}</h2>
        <dl>
          <div><dt>Waiting</dt><dd>{counts.waiting}</dd></div>
          <div><dt>Collecting</dt><dd>{counts.running}</dd></div>
          <div><dt>Ready</dt><dd>{counts.ready}</dd></div>
          <div><dt>Failed</dt><dd>{counts.failed}</dd></div>
        </dl>
        <button type="button" className="rd-v2-btn" onClick={onOpenHistory}>Open request history</button>
      </article>
      <article>
        <span className="rd-v2-eyebrow">Library</span>
        <h2>{libraryCount} dataset{libraryCount === 1 ? "" : "s"} to work with</h2>
        <p>Collected data returns to the shared Library with its source history. Ask for new data from Discover; a research operator approves each collection.</p>
        <div className="rd-v2-member-resources-actions">
          <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("library")}>Open Library</button>
          <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("browse")}>Find data in Discover</button>
        </div>
      </article>
    </div>
  );
}
