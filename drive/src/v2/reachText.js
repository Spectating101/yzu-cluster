export const STATUS_WORDS = {
  held: "In the Library",
  on_request: "Available to collect",
  live: "Searched live",
  discover: "Found through Discover",
  licensed: "Yuan Ze members",
};

export function initials(label) {
  return String(label || "")
    .replace(/\(.*?\)/g, " ")
    .split(/[\s,/·&+-]+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
