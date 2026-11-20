import { FILTERED_TABS, MATCH_STEP_TABS, SEARCH_TABS } from '../../app/shell.js';
import { Icon } from '../shared/Icon.jsx';
import { QUEUE_FOCUS_EVENT } from '../views/WorkOrderView.jsx';
import { SearchBox } from '../shared/SearchBox.jsx';
import { TREE_FOCUS_EVENT } from '../views/TreeView.jsx';
import { ViewFilters } from '../shared/ViewFilters.jsx';

export function FilterBar({ plan, view, handlers, _t, searchRef }) {
  const { archive, data, horizonDays, horizonEnd, scn, sinceDate } = plan;
  const {
    activeQuickFilters,
    activeScopeChips,
    archiveDays,
    diffOnlyChanged,
    hideDone,
    horizonOnlyPlanned,
    quickFilters,
    scopeFields,
    search,
    setArchiveDays,
    setModal,
    setSearch,
    setSearchIdx,
    setShowArchived,
    showArchived,
    sinceDays,
    tab,
  } = view;
  const { persistDiffOnlyChanged, persistHorizon, persistHorizonOnly, persistSince } = handlers;
  return (
    <>
      {/* The filter bar belongs on every view these filters actually change —
        it used to skip the Overview and the Roadmap, which both answer to the
        archive filter and the Review/Plan window, so on those two a narrowed
        view had no way to say so and no way to be widened again. Left out
        only where nothing here has an effect: Resources, Holidays, Report. */}
      {FILTERED_TABS.has(tab) && (
        <div className="subtoolbar">
          {/* Scope (project / team / person) moved into the filter popup, the
          same move the quick filters made and for the same reason: as three
          always-visible pickers they were ~380px of toolbar reading "Alle
          Pakete / Alle Teams / Alle Personen" — three empty fields waiting
          to be filled in, which is the opposite of what they are. Setting one
          is rare; seeing that one is SET has to be unmissable, and that is
          what the chips below do. */}
          {/* The quick filters used to sit here as a row of six toggles, five of
          them off at any given moment — a permanent bar of switched-off
          switches, which is what a toolbar looks like when nobody asks what
          it costs at rest. They live in the filter popup now, and come back
          out here as chips the moment one is on: a filtered view has to say
          so (principles.md, "a view is never the truth"), an unfiltered one
          has nothing to say. */}
          {(activeScopeChips.length > 0 || activeQuickFilters.length > 0) && (
            <span data-testid="active-filters" style={{ display: 'inline-flex', gap: 4, marginLeft: 4 }}>
              {activeScopeChips.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className="chip on"
                  data-testid={f.id}
                  onClick={() => f.onToggle()}
                  data-htip={_t('chip.clearTip', f.label)}
                >
                  {f.label}
                  <span aria-hidden="true" style={{ marginLeft: 5, opacity: 0.65 }}>
                    <Icon name="x" size={9} />
                  </span>
                </button>
              ))}
              {activeQuickFilters.map(f => (
                <button key={f.id} type="button" className="chip on" onClick={() => f.onToggle()} data-htip={_t('chip.clearTip', f.label)}>
                  {f.label}
                  <span aria-hidden="true" style={{ marginLeft: 5, opacity: 0.65 }}>
                    <Icon name="x" size={9} />
                  </span>
                </button>
              ))}
            </span>
          )}
          {/* Review/Plan picker — sprint-review diff window + planning horizon.
          Not a generic filter; it overlays the data with a time window. */}
          <ViewFilters
            quickFilters={quickFilters}
            scope={{ label: _t('vf.scope'), fields: scopeFields }}
            sinceDays={sinceDays}
            persistSince={persistSince}
            sinceDate={sinceDate}
            reviewPaused={!!scn && !!sinceDays}
            diffOnlyChanged={diffOnlyChanged}
            persistDiffOnlyChanged={persistDiffOnlyChanged}
            hasHistory={(data?.historyEvents || []).length > 0}
            horizonDays={horizonDays}
            persistHorizon={persistHorizon}
            horizonEnd={horizonEnd}
            horizonOnlyPlanned={horizonOnlyPlanned}
            persistHorizonOnly={persistHorizonOnly}
            hideDone={hideDone}
            archive={archive}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            archiveDays={archiveDays}
            setArchiveDays={setArchiveDays}
          />
          <div style={{ flex: 1 }} />
          {SEARCH_TABS.has(tab) && (
            <SearchBox
              searchRef={searchRef}
              onCommit={v => setSearch(v)}
              onResetIdx={() => setSearchIdx(0)}
              onPrev={MATCH_STEP_TABS.has(tab) ? () => setSearchIdx(i => i - 1) : undefined}
              onNext={MATCH_STEP_TABS.has(tab) ? () => setSearchIdx(i => i + 1) : undefined}
              // Carries the committed query so the tree can wait for ITS rows to be
              // that query's before moving the cursor — dispatching a bare event
              // would land on the first row of the previous result.
              onGoToResults={
                tab === 'tree' || tab === 'order'
                  ? q =>
                      window.dispatchEvent(new CustomEvent(tab === 'tree' ? TREE_FOCUS_EVENT : QUEUE_FOCUS_EVENT, { detail: { query: q } }))
                  : undefined
              }
              committedSearch={search}
            />
          )}
          {tab === 'tree' && (
            <button className="btn btn-sec btn-sm" onClick={() => setModal('add')} data-htip={_t('tv.addItemTip')}>
              {_t('tv.addItem')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
