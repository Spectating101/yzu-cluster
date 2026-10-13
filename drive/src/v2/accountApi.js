import { fetchJson } from "./apiCore.js";

export const accountUsage = () => fetchJson("/library/account/usage");
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
