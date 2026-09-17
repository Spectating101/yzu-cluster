import { fetchJson } from "@/v2/apiCore";

export function getResearchProfile() {
  return fetchJson("/library/profile");
}

export function saveResearchProfile(profile = {}) {
  return fetchJson("/library/profile", {
    method: "POST",
    body: JSON.stringify(profile || {}),
  });
}

export function clearResearchProfile() {
  return saveResearchProfile({ clear_profile: true });
}

export function saveResearchMemorySettings(settings = {}) {
  return fetchJson("/library/profile/memory", {
    method: "POST",
    body: JSON.stringify({ action: "settings", ...settings }),
  });
}

export function forgetResearchMemory(memoryId) {
  return fetchJson("/library/profile/memory", {
    method: "POST",
    body: JSON.stringify({ action: "forget", memory_id: memoryId }),
  });
}

export function clearResearchMemory() {
  return fetchJson("/library/profile/memory", {
    method: "POST",
    body: JSON.stringify({ action: "clear" }),
  });
}
