import { EFFECTIVE_OPEN_EVENT, EffectiveSwitch } from '../shared/Effective.jsx';
import { FileMenu } from '../shared/FileMenu.jsx';
import { Icon } from '../shared/Icon.jsx';
import { PALETTE_OPEN_EVENT } from '../shared/CommandPalette.jsx';
import { ScenarioSwitch } from '../shared/Scenario.jsx';
import { canRedo, canUndo } from '../../utils/undo.js';
import { withKey } from '../../utils/shortcuts.js';

export function TopBarState({
  _t,
  history,
  droppedCount,
  effDate,
  effDates,
  effDropDate,
  fRef,
  fileName,
  handleRedo,
  handleUndo,
  leaves,
  loadFile,
  loadFromFile,
  newProject,
  past,
  pickEffDate,
  saveToFile,
  saved,
  scenarioCreate,
  scenarioDelete,
  scenarioList,
  scenarioRename,
  scenarioSwitch,
  scheduled,
  scn,
  scnChanges,
  setModal,
  setTab,
  tab,
}) {
  return (
    <>
      {/* Which truth is on screen. Quiet while it is the plan, in the
          scenario's colour the moment it is not. */}
      {/* An earlier day is the real plan's past; a scenario has none. */}
      {!past && (
        <ScenarioSwitch
          scenarios={scenarioList}
          activeId={scn?.id || null}
          activeChanges={scnChanges.length}
          onSwitch={scenarioSwitch}
          onCreate={name => scenarioCreate(name)}
          onDuplicate={id => scenarioCreate('', { copyOf: id })}
          onRename={scenarioRename}
          onDelete={scenarioDelete}
        />
      )}
      {/* Which day you are working on. Quiet while it is today. */}
      <EffectiveSwitch date={effDate} dates={effDates} onPick={pickEffDate} onDropDate={effDropDate} travel={!!past} canTravel={!scn} />
      <button
        className="btn btn-sec btn-xs"
        data-testid="undo-btn"
        onClick={handleUndo}
        disabled={!canUndo(history)}
        data-htip={_t('undo.undo', navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl+Z')}
      >
        <Icon name="undo" size={13} />
      </button>
      <button
        className="btn btn-sec btn-xs"
        data-testid="redo-btn"
        onClick={handleRedo}
        disabled={!canRedo(history)}
        data-htip={_t('undo.redo', navigator.platform.includes('Mac') ? '⇧⌘Z' : 'Ctrl+Y')}
      >
        <Icon name="redo" size={13} />
      </button>
      {/* "How far along is this?" is the question the Overview and the Report
          are for. Anywhere else the same two numbers are a readout nobody
          asked for, in the one row every view has to look at. */}
      {(tab === 'summary' || tab === 'report') && (
        <>
          <div className="vsep" />
          <span
            className="topbar-count"
            style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--tx3)' }}
            data-htip={_t('app.countTip')}
          >
            {scheduled.length} scheduled · {leaves.filter(r => r.status === 'done').length}/{leaves.length} done
            {droppedCount > 0 && ` · ${_t('app.countDropped', droppedCount)}`}
          </span>
        </>
      )}
      <div className="sp" />
      {/* File operations have a visible home again. Phase 3 moved them all
          into the palette; opening and saving a file is not a command you go
          hunting for. The palette keeps every one of these entries — this is
          a way in, not a replacement. */}
      <FileMenu
        fileName={fileName}
        dirty={!saved}
        onLoad={() => loadFromFile()}
        onSaveAs={() => saveToFile(true)}
        onSnapshots={() => setModal('snapshots')}
        onExport={() => setTab('report')}
        onNew={() => {
          if (!saved && !confirm(_t('app.newConfirm'))) return;
          newProject();
        }}
        onJiraImport={() => setModal('jiraImport')}
        onBackdate={() => window.dispatchEvent(new Event(EFFECTIVE_OPEN_EVENT))}
      />
      <button
        className="btn btn-sec btn-sm"
        data-htip={_t('palette.openTip')}
        onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN_EVENT))}
      >
        /
      </button>
      <button
        className="btn btn-sec btn-sm"
        onClick={() => setModal('settings')}
        aria-label={_t('set.title')}
        data-htip={withKey(_t('set.title'), 'settings')}
      >
        <Icon name="gear" size={14} />
      </button>
      <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={loadFile} />
    </>
  );
}
