import { useEffect, useId, useRef, useState } from "react";
import { fetchJson } from "./apiCore.js";
import "./accounts.css";

const RESEND_SECONDS = 30;

const COPY = {
  signin: {
    title: "Sign in to Research Drive",
    lead: "We’ll email you a sign-in link. No password needed.",
    submit: "Email me a sign-in link",
  },
  signup: {
    title: "Create your account",
    lead: "Ask the research assistant, request new data, and keep your research trail in one place.",
    submit: "Create account",
  },
  invite: {
    title: "Accept your invitation",
    lead: "Use the email address your invitation was sent to, and the code that came with it.",
    submit: "Email me a sign-in link",
  },
  recover: {
    title: "Recover access",
    lead: "We’ll email a link to sign you in again. Using it signs you out everywhere else.",
    submit: "Email me a recovery link",
  },
};

function mailLink(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Open Gmail", href: "https://mail.google.com/" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return { label: "Open Outlook", href: "https://outlook.live.com/mail/" };
  return null;
}

function Lockup() {
  return (
    <div className="rd-v2-access-lockup" aria-hidden="true">
      <span className="rd-v2-access-mark">RD</span>
      <span>
        <strong>Research Drive</strong>
        <small>Research data you can use, with where it came from</small>
      </span>
    </div>
  );
}

function SentState({ email, purpose, notice, onResend, onChangeEmail, busy }) {
  const [wait, setWait] = useState(RESEND_SECONDS);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setWait((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);
  const inbox = mailLink(email);
  return (
    <div className="rd-access-sent" data-testid="access-check-email">
      <h1 id="rd-access-screen-title">Check your email</h1>
      <p>
        We sent a link to <strong>{email}</strong>.{" "}
        {purpose === "signup" ? "Open it to finish creating your account." : "Open it to sign in."} It works for 15 minutes.
      </p>
      <div className="rd-access-actions">
        {inbox ? <a className="rd-v2-btn primary" href={inbox.href} target="_blank" rel="noreferrer">{inbox.label}</a> : null}
        <button type="button" className="rd-v2-btn" disabled={busy || wait > 0} onClick={() => { setWait(RESEND_SECONDS); onResend(); }}>
          {busy ? "Sending…" : wait > 0 ? `Send again in ${wait}s` : "Send again"}
        </button>
        <button type="button" className="rd-v2-btn ghost" onClick={onChangeEmail}>Use a different email</button>
      </div>
      <small>Not there? Check your spam folder. You can request up to three links an hour.{notice ? ` ${notice}` : ""}</small>
    </div>
  );
}

export function AccessScreen({ mode = "signin", session, onModeChange, onClose, onMemberCodeSignIn }) {
  const id = useId();
  const emailAvailable = Boolean(session?.email_sign_in_available);
  const signupAvailable = emailAvailable && Boolean(session?.email_signup_available);
  const codeAvailable = Boolean(session?.member_access_code_available) || session?.member_sign_in_mode === "invite_code";
  const purpose = mode === "signup" && !signupAvailable ? "signin" : mode;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const firstField = useRef(null);
  const root = useRef(null);

  useEffect(() => {
    const siblings = Array.from(root.current?.parentElement?.children || []).filter((node) => node !== root.current && !node.inert);
    siblings.forEach((node) => { node.inert = true; });
    return () => siblings.forEach((node) => { node.inert = false; });
  }, []);

  useEffect(() => {
    setError("");
    firstField.current?.focus();
  }, [purpose, sent]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const requestLink = async () => {
    setBusy(true);
    setError("");
    try {
      const out = await fetchJson("/library/desk/email/request", {
        method: "POST",
        timeoutMs: 15000,
        body: JSON.stringify({
          email,
          purpose,
          ...(purpose === "invite" ? { invitation: code } : {}),
          ...(purpose === "signup" ? { display_name: name } : {}),
        }),
      });
      setCode("");
      setSent({ email, purpose, notice: String(out?.message || "") });
    } catch (reason) {
      setError(String(reason?.message || reason || "The link could not be sent. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const signInWithCode = async () => {
    setBusy(true);
    setError("");
    try {
      await onMemberCodeSignIn?.(code);
      setCode("");
      onClose?.();
    } catch (reason) {
      setError(String(reason?.message || reason || "That invitation code was not accepted."));
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[purpose] || COPY.signin;
  let body;
  if (sent) {
    body = (
      <SentState
        email={sent.email}
        purpose={sent.purpose}
        notice={sent.notice}
        busy={busy}
        onResend={requestLink}
        onChangeEmail={() => setSent(null)}
      />
    );
  } else if (emailAvailable) {
    body = (
      <>
        {purpose === "signin" || purpose === "signup" ? (
          signupAvailable ? (
            <div className="rd-access-tabs" role="tablist" aria-label="Account">
              <button type="button" role="tab" aria-selected={purpose === "signin"} onClick={() => onModeChange?.("signin")}>Sign in</button>
              <button type="button" role="tab" aria-selected={purpose === "signup"} onClick={() => onModeChange?.("signup")}>Create account</button>
            </div>
          ) : null
        ) : (
          <button type="button" className="rd-access-back" onClick={() => onModeChange?.("signin")}>← Back to sign in</button>
        )}
        <h1 id="rd-access-screen-title">{copy.title}</h1>
        <p className="rd-access-lead">{copy.lead}</p>
        <form className="rd-access-form" onSubmit={(event) => { event.preventDefault(); requestLink(); }}>
          {purpose === "signup" ? (
            <label htmlFor={`${id}-name`}>
              Your name
              <input ref={firstField} id={`${id}-name`} className="rd-v2-input" autoComplete="name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          ) : null}
          <label htmlFor={`${id}-email`}>
            {purpose === "signup" ? "University email" : "Email"}
            <input
              ref={purpose === "signup" ? undefined : firstField}
              id={`${id}-email`}
              className="rd-v2-input"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {purpose === "invite" ? (
            <label htmlFor={`${id}-code`}>
              Invitation code
              <input id={`${id}-code`} className="rd-v2-input" type="password" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
          ) : null}
          <button type="submit" className="rd-v2-btn primary" disabled={busy}>{busy ? "Sending…" : copy.submit}</button>
          {purpose === "signup" ? (
            <small>Your research trail is visible to you and the desk operators. Other researchers see only the shared Library.</small>
          ) : null}
          {error ? <p className="rd-access-error" role="alert">{error}</p> : null}
        </form>
        {purpose === "signin" || purpose === "signup" ? (
          <div className="rd-access-links">
            <button type="button" onClick={() => onModeChange?.("invite")}>Have an invitation code?</button>
            <button type="button" onClick={() => onModeChange?.("recover")}>Lost access to your account?</button>
          </div>
        ) : null}
      </>
    );
  } else if (codeAvailable) {
    body = (
      <>
        <h1 id="rd-access-screen-title">Sign in to Research Drive</h1>
        <p className="rd-access-lead">Research Drive is invite-only on this site. Enter the invitation code you received.</p>
        <form className="rd-access-form" onSubmit={(event) => { event.preventDefault(); signInWithCode(); }}>
          <label htmlFor={`${id}-code`}>
            Invitation code
            <input ref={firstField} id={`${id}-code`} className="rd-v2-input" type="password" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button type="submit" className="rd-v2-btn primary" disabled={busy || !code.trim()}>{busy ? "Signing in…" : "Sign in"}</button>
          {error ? <p className="rd-access-error" role="alert">{error}</p> : null}
        </form>
        <small>No code yet? Ask the lab’s Research Drive operator for an invitation.</small>
      </>
    );
  } else {
    body = (
      <>
        <h1 id="rd-access-screen-title">Sign-in isn’t open here yet</h1>
        <p className="rd-access-lead">You can keep browsing the shared Library and Discover without an account.</p>
      </>
    );
  }

  return (
    <div ref={root} className="rd-v2-access-gate rd-access-screen" role="dialog" aria-modal="true" aria-labelledby="rd-access-screen-title" data-testid="access-screen">
      <section className="rd-v2-access-card">
        <Lockup />
        {body}
        <button type="button" className="rd-access-close" onClick={onClose}>Back to browsing</button>
      </section>
    </div>
  );
}
