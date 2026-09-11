/** Keep an already-painted field during another result leg for the same query. */
export function shouldAppendDiscoverPaint({ append = false, sameQuery = false, currentCount = 0 } = {}) {
  return Boolean(append || (sameQuery && Number(currentCount) > 0));
}
