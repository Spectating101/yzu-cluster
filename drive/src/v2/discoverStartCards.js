import { libraryLenses } from "./libraryFocus.js";

export const START_CARD_LIMIT = 3;

export function tryPhrases(focus) {
  const topics = (focus?.topics || []).map((t) => String(t).trim()).filter(Boolean);
  if (topics.length) return topics.slice(0, 3);
  return ["inflation", "unemployment across countries", "exchange rates"];
}

export function startCards({ catalog = [], focus = null, collectable = [], limit = START_CARD_LIMIT }) {
  const lens = libraryLenses(catalog, focus)[0];
  const route = (collectable || []).find(Boolean);
  const heldLimit = route ? limit - 1 : limit;
  const cards = (lens?.rows || []).slice(0, heldLimit).map((row) => ({ kind: "held", row }));
  if (route) cards.push({ kind: "collect", row: route });
  return cards;
}
