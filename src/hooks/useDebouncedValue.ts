import { useEffect, useState } from "react";

/**
 * Returns a debounced echo of `value` that only updates after `delayMs` has
 * elapsed without changes. Useful for piping a fast-changing input
 * (search-box value, slider) into an expensive consumer (text search,
 * remote query).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
