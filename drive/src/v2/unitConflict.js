/**
 * Two columns about to be combined whose typical magnitudes disagree.
 *
 * This is the failure that does not fail. Subtracting a percentage from a
 * fraction returns a plausible number, and every statistic downstream inherits
 * it — a median excess return of −0.0200 where the truth is −0.000200. The desk
 * cannot tell which series is correct, only that they cannot both be, so this is
 * one of the few things worth stopping a researcher for.
 */

export const SUSPICIOUS_RATIO = 5;

export function magnitudeGap(left, right) {
  const a = Math.abs(Number(left?.typical ?? NaN));
  const b = Math.abs(Number(right?.typical ?? NaN));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return null;
  const ratio = a > b ? a / b : b / a;
  return {
    ratio: Number(ratio.toFixed(1)),
    suspicious: ratio >= SUSPICIOUS_RATIO,
    larger: a > b ? String(left?.column || "") : String(right?.column || ""),
  };
}

export function unitOutcomes(conflict) {
  const outcomes = Array.isArray(conflict?.outcomes) ? conflict.outcomes : [];
  return outcomes.map((outcome) => ({
    id: String(outcome?.id || ""),
    label: String(outcome?.label || ""),
    result: outcome?.result ?? null,
    resultLabel: outcome?.result == null ? "not computed" : formatResult(outcome.result),
    recommended: Boolean(outcome?.recommended),
  }));
}

/**
 * The numbers this panel exists for are small: -0.000200 against -0.020000. An
 * exponential threshold at 0.001 renders the first as -2.00e-4, which is the one
 * form a reader cannot compare at a glance. Only genuinely extreme values get
 * exponent notation.
 */
export function formatResult(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "not computed";
  const magnitude = Math.abs(number);
  if (magnitude !== 0 && (magnitude < 1e-5 || magnitude >= 1e7)) return number.toExponential(2);
  return String(Number(number.toPrecision(6)));
}

/**
 * Both outcomes shown side by side is the whole point — a single recommended
 * number is what let the wrong one ship unnoticed.
 */
export function unitSpread(conflict) {
  const outcomes = unitOutcomes(conflict).filter((outcome) => Number.isFinite(Number(outcome.result)));
  if (outcomes.length < 2) return null;
  const values = outcomes.map((outcome) => Math.abs(Number(outcome.result)));
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === 0) return null;
  return Number((high / low).toFixed(1));
}
