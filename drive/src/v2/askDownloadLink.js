export function askDownloadLink(text) {
  const match = String(text).match(/^\[([^\]\n]+)\]\((\/library\/datasets\/[A-Za-z0-9_.-]+\/download(?:\?revision=[A-Za-z0-9_.%~-]+)?)\)$/);
  return match && !/\/datasets\/(?:\.|\.\.)\//.test(match[2])
    ? { label: match[1], href: match[2] }
    : null;
}
