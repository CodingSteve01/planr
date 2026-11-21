import { localDate } from '../date.js';

// Resolve member ID to short initials with collision handling
export function shortInitials(members) {
  const map = {},
    counts = {};
  const bases = (members || []).map(m => {
    const words = (m.name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length === 1
      ? words[0].slice(0, 2).toUpperCase()
      : words
          .map(w => w[0])
          .join('')
          .toUpperCase();
  });
  bases.forEach(b => {
    counts[b] = (counts[b] || 0) + 1;
  });
  const seen = {};
  (members || []).forEach((m, i) => {
    const base = bases[i];
    if (counts[base] === 1) map[m.id] = base;
    else {
      seen[base] = (seen[base] || 0) + 1;
      map[m.id] = base + seen[base];
    }
  });
  return map;
}

// Start and end of every node: a leaf's own window, a parent's span over its children.
export function scheduleRanges(tree, sMap) {
  const childrenByParent = {};
  tree.forEach(node => {
    const pid = node.id.split('.').slice(0, -1).join('.') || '';
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(node.id);
  });
  const makeWindow = (startValue, endValue) => {
    const start = startValue ? (startValue instanceof Date ? startValue : localDate(startValue)) : null;
    const end = endValue ? (endValue instanceof Date ? endValue : localDate(endValue)) : start;
    if (!start || !end) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  };
  const map = {};
  const visit = id => {
    if (Object.prototype.hasOwnProperty.call(map, id)) return map[id];
    const node = tree.find(entry => entry.id === id);
    if (!node) return null;
    const childIds = childrenByParent[id] || [];
    if (!childIds.length) {
      const actual =
        node.status === 'done'
          ? makeWindow(node.completedStart || node.completedAt, node.completedAt || node.completedEnd || node.completedStart)
          : null;
      const scheduledWindow = sMap[id]?.startD && sMap[id]?.endD ? makeWindow(sMap[id].startD, sMap[id].endD) : null;
      map[id] = actual || scheduledWindow;
      return map[id];
    }
    const childWindows = childIds.map(visit).filter(Boolean);
    if (!childWindows.length) {
      map[id] = null;
      return null;
    }
    map[id] = {
      start: new Date(Math.min(...childWindows.map(window => window.start.getTime()))),
      end: new Date(Math.max(...childWindows.map(window => window.end.getTime()))),
    };
    return map[id];
  };
  (childrenByParent[''] || []).forEach(visit);
  return map;
}

// Position of the selected id within its sibling group — drives first/last button disabled state.
export function siblingPosition(tree, selectedId) {
  if (!selectedId) return null;
  const parts = selectedId.split('.');
  const isRoot = parts.length === 1;
  const myPrefix = isRoot ? selectedId.match(/^[A-Za-z]+/)?.[0] || '' : '';
  const rank = r => (typeof r.displayOrder === 'number' ? r.displayOrder : parseInt(r.id.split('.').pop().replace(/\D/g, '')) || 0);
  const siblings = tree
    .filter(x => {
      if (isRoot) return !x.id.includes('.') && (x.id.match(/^[A-Za-z]+/)?.[0] || '') === myPrefix;
      return x.id.split('.').slice(0, -1).join('.') === parts.slice(0, -1).join('.');
    })
    .sort((a, b) => {
      return rank(a) - rank(b) || a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  const idx = siblings.findIndex(x => x.id === selectedId);
  return { idx, count: siblings.length };
}
