// Only a short-lived local consent ticket is retained; never a callback URL.
const KEY = "rd.connector-return";
const valid = (ticket) => typeof ticket === "string" && /^[A-Za-z0-9_-]{43}$/.test(ticket);

export function rememberConnectorReturn() {
  if (typeof window === "undefined") return;
  const ticket = new URLSearchParams(window.location.search).get("connect_request");
  if (!valid(ticket)) return;
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ticket, expires: Date.now() + 600000 })); } catch { /* Link remains usable from consent. */ }
}

export function connectorReturnPath({ consume = false } = {}) {
  if (typeof window === "undefined") return null;
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    if (!valid(pending?.ticket) || !Number.isFinite(pending?.expires) || pending.expires <= Date.now()) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    if (consume) window.sessionStorage.removeItem(KEY);
    return `/oauth/consent?request_id=${pending.ticket}`;
  } catch { return null; }
}
