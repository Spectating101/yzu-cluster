export function LockMark({ className = "rd-v2-status-lock" }) {
  return (
    <svg className={className} viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
      <rect x="2" y="5.2" width="8" height="5.6" rx="1.3" fill="currentColor" />
      <path d="M4 5.2V3.8a2 2 0 0 1 4 0v1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const WHO = {
  account: { label: "With an account", title: "Sign in to use this" },
  yuanze: { label: "Yuan Ze members", title: "Sign in with a Yuan Ze email to use this" },
  lab: { label: "Lab members", title: "Collection requests need lab membership" },
};

export const lockTitle = (who) => (WHO[who] || WHO.account).title;

export function LockTag({ who = "account" }) {
  const entry = WHO[who] || WHO.account;
  return (
    <span className={`rd-v2-lock-tag is-${who}`} title={entry.title}>
      <LockMark className="rd-v2-lock-mark" />
      {entry.label}
    </span>
  );
}
