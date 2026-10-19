/** Shared lifecycle vocabulary for every primary surface. */
export const SURFACE_LIFECYCLE = Object.freeze([
  "idle",
  "loading",
  "partial",
  "ready",
  "empty",
  "stale",
  "error",
]);

export function resolveSurfaceLifecycle({
  idle = false,
  loading = false,
  error = "",
  count = 0,
  hasData = Number(count) > 0,
} = {}) {
  if (idle) return "idle";
  if (error && hasData) return "stale";
  if (error) return "error";
  if (loading && hasData) return "partial";
  if (loading) return "loading";
  return hasData ? "ready" : "empty";
}
