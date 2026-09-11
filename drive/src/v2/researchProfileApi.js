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
