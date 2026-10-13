import { fetchJson } from "./apiCore.js";

export const accountUsage = () => fetchJson("/library/account/usage").then((out) => {
  if (!out?.limits || ![out.hourly_remaining, out.daily_remaining, out.limits.hourly_requests, out.limits.daily_requests].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("The assistant allowance response is unavailable. Try refreshing shortly.");
  }
  return out;
});
export const listDeskAccounts = () => fetchJson("/library/admin/accounts");
export const changeDeskAccount = (payload) => fetchJson("/library/admin/accounts", {
  method: "POST", body: JSON.stringify(payload),
});

export const ACCOUNT_ROLES = {
  public_guest: "Guest",
  public_member: "Researcher",
  member: "Lab member",
  operator: "Operator",
};
