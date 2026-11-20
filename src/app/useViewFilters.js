import { useEffect, useState } from 'react';
import { ARCHIVE_DEFAULT_DAYS } from '../utils/archive.js';
import { store, storedFlag, storedText } from './storage.js';

function storedArchiveDays() {
  try {
    const v = parseInt(localStorage.getItem('planr_archive_days'), 10);
    return Number.isFinite(v) && v > 0 ? v : ARCHIVE_DEFAULT_DAYS;
  } catch {
    return ARCHIVE_DEFAULT_DAYS;
  }
}

// Writes a filter back whenever it changes — and once on mount, with the
// value it was read as.
function usePersisted(key, value) {
  useEffect(() => {
    store(key, String(value));
  }, [value]);
}

// The view filters that survive a reload: scope (project / team / person),
// the quick filters and the archive filter. State only; what they filter is
// derived in App.jsx.
export function useViewFilters() {
  const [teamFilter, setTeamFilter] = useState(() => storedText('planr_team_filter'));
  const [rootFilter, setRootFilter] = useState(() => storedText('planr_root_filter'));
  const [personFilter, setPersonFilter] = useState(() => storedText('planr_person_filter'));
  const [hideDone, setHideDone] = useState(() => storedFlag('planr_hide_done'));
  // Archive filter — see utils/archive.js. Default ON (i.e. archived hidden):
  // a plan that has been running for a year should open on the work that is
  // still live, not on last spring's finished projects.
  const [showArchived, setShowArchived] = useState(() => storedFlag('planr_show_archived'));
  const [archiveDays, setArchiveDays] = useState(storedArchiveDays);
  const [onlyAutoAssigned, setOnlyAutoAssigned] = useState(() => storedFlag('planr_only_auto'));
  const [onlyOverdue, setOnlyOverdue] = useState(() => storedFlag('planr_only_overdue'));
  const [onlyUnestimated, setOnlyUnestimated] = useState(() => storedFlag('planr_only_unest'));
  const [onlyOverbooked, setOnlyOverbooked] = useState(() => storedFlag('planr_only_overbooked'));
  usePersisted('planr_hide_done', hideDone);
  usePersisted('planr_show_archived', showArchived);
  usePersisted('planr_archive_days', archiveDays);
  usePersisted('planr_team_filter', teamFilter);
  usePersisted('planr_root_filter', rootFilter);
  usePersisted('planr_person_filter', personFilter);
  usePersisted('planr_only_auto', onlyAutoAssigned);
  usePersisted('planr_only_overdue', onlyOverdue);
  usePersisted('planr_only_unest', onlyUnestimated);
  usePersisted('planr_only_overbooked', onlyOverbooked);
  return {
    teamFilter,
    setTeamFilter,
    rootFilter,
    setRootFilter,
    personFilter,
    setPersonFilter,
    hideDone,
    setHideDone,
    showArchived,
    setShowArchived,
    archiveDays,
    setArchiveDays,
    onlyAutoAssigned,
    setOnlyAutoAssigned,
    onlyOverdue,
    setOnlyOverdue,
    onlyUnestimated,
    setOnlyUnestimated,
    onlyOverbooked,
    setOnlyOverbooked,
  };
}
