export function shortSourceLabel(raw) {
  const head = String(raw || "").split(/\s+[/|–—-]\s+|\s*\(/)[0].trim();
  const words = head.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word));
  if (words.length >= 3) {
    const initials = words.filter((word) => !/^(of|the|and|for|de|du)$/i.test(word)).map((word) => word[0]).join("");
    if (initials.length >= 3 && initials.length <= 5) return initials.toUpperCase();
  }
  const first = words[0] || head;
  return (words.length > 1 && first.length < 4 ? `${first} ${words[1]}` : first).slice(0, 10).toUpperCase();
}
