import { useState, useDeferredValue } from 'react';

// Committed, debounced search only — the raw input state lives inside
// <SearchBox> so keystrokes don't trigger an App-level render and cascade
// through every mounted tab pane.
export function useSearch() {
  const [search, setSearch] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const deferredSearch = useDeferredValue(search);
  return { search, setSearch, searchIdx, setSearchIdx, deferredSearch };
}
