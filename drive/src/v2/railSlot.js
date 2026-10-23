import { useSyncExternalStore } from "react";

let slot = null;
const listeners = new Set();

export function setRailSlot(element) {
  if (slot === element) return;
  slot = element;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRailSlot() {
  return useSyncExternalStore(subscribe, () => slot, () => null);
}
