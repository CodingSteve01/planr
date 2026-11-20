import { useMemo } from 'react';

// The tasks the search matches and the one the cursor is on.
export function useGanttSearch({ displayItems, searchNeedle, visibleRows, searchIdx }) {
  const searchableItems = useMemo(
    () => displayItems.map(item => ({ id: item.id, text: `${item.id} ${item.name || ''}`.toLowerCase() })),
    [displayItems],
  );

  // Search acts as a real Gantt filter. The filtering itself happens where
  // the display items are built (utils/gantt/items.js `filterDisplayItems`,
  // which matches a task and its ancestor path); what is left here is the
  // set of what survived it.
  const searchMatches = useMemo(() => {
    if (!searchNeedle) return null;
    return new Set(searchableItems.map(item => item.id));
  }, [searchNeedle, searchableItems]);
  // Visible matches in row order — only tasks currently shown (not inside collapsed groups).
  const searchMatchList = useMemo(() => {
    if (!searchMatches?.size) return [];
    return visibleRows.filter(r => r.type === 'task' && searchMatches.has(r.s.id)).map(r => r.s.id);
  }, [searchMatches, visibleRows]);
  const activeMatchId = searchMatchList.length
    ? searchMatchList[((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length]
    : null;
  return { searchableItems, searchMatches, searchMatchList, activeMatchId };
}
