export function licensedRowsLocked(dataset) {
  return Boolean(dataset?.licensed) && dataset?.rows_available === false;
}

export const MEMBERS_ONLY_TEXT = "Rows from university subscriptions (LSEG, CRSP, Compustat) are for Yuan Ze members. Sign in with your Yuan Ze email to read them.";
