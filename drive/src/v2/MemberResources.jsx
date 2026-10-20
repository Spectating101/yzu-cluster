import { useEffect, useState } from "react";
import { accountUsage } from "./accountApi.js";
import { requestCounts } from "./requestCounts.js";
import { ReachAbilities, ReachSources, ReachStats, useReach } from "./ResourcesReach.jsx";

export function MemberResources({ signedIn, licensedOpen = false, jobs, libraryCount, onGoTab, onOpenHistory, onSignIn }) {
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

  const reachBody = (
    <div className="rd-v2-reach">
      <ReachStats reach={reach} libraryCount={libraryCount} />
      <div className="rd-v2-reach-grid">
        <ReachSources reach={reach} licensedOpen={licensedOpen} />
        <ReachAbilities signedIn={signedIn} licensedOpen={licensedOpen} />
      </div>
    </div>
  );

  if (!signedIn) {
    return (
      <>
        <section className="rd-v2-reach-hero">
          <div>
            <h2>Everything Research Drive can reach</h2>
            <p>The data the desk holds, the sources it collects from, and the tools behind it. Most of it is open now; a padlock marks what needs an account or a Yuan Ze email.</p>
          </div>
          <div className="rd-v2-member-resources-actions">
            {onSignIn ? <button type="button" className="rd-v2-btn primary" onClick={onSignIn}>Sign in</button> : null}
            <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("library")}>Browse the Library</button>
          </div>
        </section>
        {reachBody}
      </>
    );
  }

  return (
    <>
    <h2 className="rd-v2-reach-section-title">Your access and use</h2>
    <div className="rd-v2-member-resources" data-testid="member-resources">
      <article>
        <span className="rd-v2-eyebrow">Research assistant</span>
        <h2>{usage ? `${usage.hourly_remaining} of ${usage.limits.hourly_requests} left this hour` : usageError ? "Allowance unavailable" : "Reading allowance…"}</h2>
        <p>{usage ? `${usage.daily_remaining} of ${usage.limits.daily_requests} left in the last 24 hours. Browsing never uses it.` : usageError ? "The desk could not read your allowance just now. Browsing and downloads are not affected." : "Ask, coverage checks and advice use this allowance."}</p>
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
    {reachBody}
    </>
  );
}
