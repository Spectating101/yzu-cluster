export function waitingAge(ts, now = Date.now()) {
  const started = new Date(ts).getTime();
  if (!ts || Number.isNaN(started)) return "";
  const days = Math.floor((now - started) / 86400000);
  if (days < 1) return "waiting since today";
  if (days < 2) return "waiting 1 day";
  if (days < 14) return `waiting ${days} days`;
  if (days < 60) return `waiting ${Math.floor(days / 7)} weeks`;
  return `waiting ${Math.floor(days / 30)} months`;
}
