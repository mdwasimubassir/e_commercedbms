import { useEffect, useState } from "react";

// Returns a copy of `value` that only updates after `delay` ms of no changes.
// Used to avoid re-filtering the catalog on every single keystroke.
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
