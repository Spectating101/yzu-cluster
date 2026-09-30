// A transport failure is not product copy. Without a session the live desk
// rendered "Desk access token required (set Authorization: Bearer or
// X-Desk-Token)" as body text, twice, inside panels meant for explanation —
// telling a researcher to set an HTTP header on a page about constructions.
//
// normalizeApiError passes the API's own message through, which is right for a
// log and wrong for a screen. This turns it into something the reader can act
// on, and keeps the original as detail rather than discarding it.

const RULES = [
  {
    match: /unauthor|access token|401|forbidden|403/i,
    headline: "Research Drive needs a session",
    say: (surface) => `Sign in to load ${surface}. Research Drive needs to know who is asking before it can answer.`,
  },
  {
    match: /timed out|timeout/i,
    headline: "Research Drive did not answer in time",
    say: (surface) => `${capitalise(surface)} could not be loaded before the request expired. Retry, or check that Research Drive is reachable.`,
  },
  {
    match: /50\d|server error|internal/i,
    headline: "Research Drive could not complete that request",
    say: (surface) => `${capitalise(surface)} is unavailable right now because of a Research Drive error.`,
  },
  {
    match: /failed to fetch|networkerror|econnrefused/i,
    headline: "Research Drive is unreachable",
    say: (surface) => `${capitalise(surface)} could not be requested. Check that Research Drive is running.`,
  },
];

function capitalise(s) {
  const t = String(s || "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * @returns {{headline: string, body: string, detail: string} | null}
 *          null when there is no error to show.
 */
export function deskErrorCopy(raw, { surface = "this page" } = {}) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const rule = RULES.find((r) => r.match.test(text));
  if (rule) {
    return { headline: rule.headline, body: rule.say(surface), detail: text };
  }
  return {
    headline: "That did not load",
    body: `${capitalise(surface)} could not be loaded because Research Drive reported an error.`,
    detail: text,
  };
}

/** True when the failure is "you are not signed in" rather than a fault. */
export function isSessionError(raw) {
  return RULES[0].match.test(String(raw || ""));
}
