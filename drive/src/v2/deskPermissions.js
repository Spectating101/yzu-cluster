import { useSyncExternalStore } from "react";

const SIGN_IN_EVENT = "rd-request-sign-in";
const listeners = new Set();
let current = null;

export function publishDeskAccess(access) {
  current = access || null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function deskPermission(name) {
  if (!current?.permissions) return null;
  return Boolean(current.permissions[name]);
}

export function useDeskPermission(name) {
  return useSyncExternalStore(subscribe, () => deskPermission(name), () => null);
}

export function requestDeskSignIn(mode = "signin") {
  window.dispatchEvent(new CustomEvent(SIGN_IN_EVENT, { detail: { mode } }));
}

export function onDeskSignInRequest(handler) {
  const listener = (event) => handler(event?.detail?.mode || "signin");
  window.addEventListener(SIGN_IN_EVENT, listener);
  return () => window.removeEventListener(SIGN_IN_EVENT, listener);
}

export function licensedRowsLocked(dataset) {
  return Boolean(dataset?.licensed) && dataset?.rows_available === false;
}

export const MEMBERS_ONLY_TEXT = "Rows from university subscriptions (LSEG, CRSP, Compustat) are for Yuan Ze members. Sign in with your Yuan Ze email to read them.";
