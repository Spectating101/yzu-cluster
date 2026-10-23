export function shortDate(value, { time = false, now = new Date() } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  if (time) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString(undefined, options);
}
