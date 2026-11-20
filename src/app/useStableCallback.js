import { useCallback, useRef } from 'react';

// useEvent shim — stable callback ref that always invokes the latest closure.
// Lets us pass App-defined functions to React.memo'd children without busting
// memoization on every render, while keeping the function's captured state
// fresh. Safe for callbacks invoked imperatively (event handlers, etc.) — do
// NOT use during render.
export function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}
