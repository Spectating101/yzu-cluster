import { useEffect, useState } from "react";
import { accountUsage } from "./accountApi.js";
import { requestCounts } from "./requestCounts.js";
import { MEMBERS_ONLY_TEXT } from "./licensedAccess.js";

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
      <>
        <section className="rd-v2-guest-feature-hero">
          <span className="rd-v2-eyebrow">Resources</span>
          <h2>What you can do here, and what needs an account</h2>
          <p>Most of the desk works without signing in. An account is needed only where the desk has to remember you, and a Yuan Ze email only where a university licence applies.</p>
          <div className="rd-v2-member-resources-actions">
            {onSignIn ? <button type="button" className="rd-v2-btn primary" onClick={onSignIn}>Sign in</button> : null}
            <button type="button" className="rd-v2-btn" onClick={() => onGoTab?.("library")}>Browse the Library</button>
          </div>
        </section>
        <div className="rd-v2-member-resources" data-testid="guest-resources-access" role="group" aria-label="What each level of access includes">
          <article>
            <span className="rd-v2-eyebrow">Open to everyone</span>
            <h2>{libraryCount} dataset{libraryCount === 1 ? "" : "s"} to read now</h2>
            <ul>
              <li>Preview, query and download as CSV</li>
              <li>See each dataset's source and coverage</li>
              <li>Check what the Library covers in Discover</li>
              <li>Read saved Synthesis results</li>
            </ul>
          </article>
          <article>
            <span className="rd-v2-eyebrow">Needs an account</span>
            <h2>Where the desk remembers you</h2>
            <ul>
              <li>Ask, the research assistant</li>
              <li>Requests for new collections</li>
              <li>Synthesis builds saved to your Library</li>
              <li>A research profile that tunes the Library</li>
            </ul>
          </article>
          <article>
            <span className="rd-v2-eyebrow">Needs a Yuan Ze email</span>
            <h2>University-licensed data</h2>
            <p>{MEMBERS_ONLY_TEXT}</p>
          </article>
        </div>
      </>
    );
  }

  return (
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
  );
}
