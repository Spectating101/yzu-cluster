import { useSyncExternalStore } from "react";

let state = { threadId: "", detail: null, railMounted: false };
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const methodSelection = {
  select(threadId, detail) { set({ threadId, detail }); },
  clear() { if (state.detail) set({ threadId: "", detail: null }); },
  setRailMounted(railMounted) { if (state.railMounted !== railMounted) set({ railMounted }); },
};

export function useMethodSelection() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
  );
}
