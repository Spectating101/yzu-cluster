/** Keep rows a researcher has already seen in place; later arrivals queue after them. */
export function pinOrder(rows, keyOf, order) {
  for (const row of rows) {
    const key = keyOf(row);
    if (key && !order.has(key)) order.set(key, order.size);
  }
  const rank = (row) => order.get(keyOf(row)) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((left, right) => rank(left) - rank(right));
}
