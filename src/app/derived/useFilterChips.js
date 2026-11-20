import { useMemo } from 'react';

// The quick filters as data, so the sub-toolbar and the filter popup show
// the same set without either of them owning it. Two of them only exist
// when they have something to filter: an archive toggle on a plan with
// nothing archived, or an overbooked toggle with nobody overbooked, is a
// control that can only disappoint.
function buildQuickFilters(s) {
  const { _t, hideDone, setHideDone, showArchived, setShowArchived, archiveCount } = s;
  const { onlyAutoAssigned, setOnlyAutoAssigned, onlyOverdue, setOnlyOverdue } = s;
  const { onlyUnestimated, setOnlyUnestimated, onlyOverbooked, setOnlyOverbooked, overbookedCount } = s;
  return [
    { id: 'hideDone', label: _t('chip.hideDone'), tip: _t('chip.hideDoneTip'), active: hideDone, onToggle: () => setHideDone(v => !v) },
    archiveCount > 0
      ? {
          id: 'archived',
          label: _t('arch.pill', archiveCount),
          tip: _t('arch.chipTip'),
          active: showArchived,
          onToggle: () => setShowArchived(v => !v),
        }
      : null,
    {
      id: 'auto',
      label: _t('chip.auto'),
      tip: _t('chip.autoTip'),
      active: onlyAutoAssigned,
      onToggle: () => setOnlyAutoAssigned(v => !v),
    },
    {
      id: 'overdue',
      label: _t('chip.overdue'),
      tip: _t('chip.overdueTip'),
      active: onlyOverdue,
      onToggle: () => setOnlyOverdue(v => !v),
    },
    {
      id: 'unestimated',
      label: _t('chip.unestimated'),
      tip: _t('chip.unestimatedTip'),
      active: onlyUnestimated,
      onToggle: () => setOnlyUnestimated(v => !v),
    },
    overbookedCount > 0
      ? {
          id: 'overbooked',
          label: _t('chip.overbooked', overbookedCount),
          tip: _t('chip.overbookedTip'),
          active: onlyOverbooked,
          onToggle: () => setOnlyOverbooked(v => !v),
        }
      : null,
  ].filter(Boolean);
}

function buildScopeFields(s) {
  const { _t, rootFilter, setRootFilter, teamFilter, setTeamFilter, personFilter, setPersonFilter } = s;
  const { netRootOptions, teams, activeMembers, setSearchIdx } = s;
  return [
    {
      id: 'root',
      value: rootFilter,
      options: netRootOptions,
      showIds: true,
      placeholder: _t('tv.allRoots'),
      onSelect: v => {
        setRootFilter(v);
        setSearchIdx(0);
      },
    },
    {
      id: 'team',
      value: teamFilter,
      options: teams.map(t => ({ id: t.id, label: t.name || t.id })),
      placeholder: _t('tv.allTeams'),
      onSelect: v => {
        setTeamFilter(v);
        setSearchIdx(0);
      },
    },
    {
      id: 'person',
      value: personFilter,
      options: activeMembers.map(m => ({ id: m.id, label: m.name || m.id })),
      placeholder: _t('tv.allPeople'),
      onSelect: v => {
        setPersonFilter(v);
        setSearchIdx(0);
      },
    },
  ];
}

// The filter chips of the sub-toolbar and the filter popup. Takes one object,
// returns one object.
export function useFilterChips(args) {
  const { _t, hideDone, showArchived, onlyAutoAssigned, onlyOverdue, onlyUnestimated, onlyOverbooked } = args;
  const { archive, overbookedTaskIds, rootFilter, teamFilter, personFilter, netRootOptions, teams, activeMembers } = args;
  const quickFilters = useMemo(
    () => buildQuickFilters({ ...args, archiveCount: archive.count, overbookedCount: overbookedTaskIds.size }),
    [_t, hideDone, archive.count, showArchived, onlyAutoAssigned, onlyOverdue, onlyUnestimated, overbookedTaskIds.size, onlyOverbooked],
  );
  const activeQuickFilters = useMemo(() => quickFilters.filter(f => f.active), [quickFilters]);

  // Scope lives in the filter popup and comes back out as a chip the moment
  // one is set — a narrowed view has to say so (principles.md, "a view is
  // never the truth"), an unnarrowed one has nothing to say. The chip clears
  // the filter, which is the only thing you want from it once you see it.
  const scopeFields = useMemo(
    () => buildScopeFields(args),
    [rootFilter, teamFilter, personFilter, netRootOptions, teams, activeMembers, _t],
  );
  const activeScopeChips = useMemo(
    () =>
      scopeFields
        .filter(f => f.value)
        .map(f => ({
          id: `scope-${f.id}`,
          label: f.options.find(o => o.id === f.value)?.label || f.value,
          onToggle: () => f.onSelect(''),
        })),
    [scopeFields],
  );
  return { quickFilters, activeQuickFilters, scopeFields, activeScopeChips };
}
