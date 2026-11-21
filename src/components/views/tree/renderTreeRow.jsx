import { PersonChip } from '../../shared/PersonChip.jsx';
import { Icon } from '../../shared/Icon.jsx';
import { StatusIcon } from '../../shared/StatusIcon.jsx';
import { SearchSelect } from '../../shared/SearchSelect.jsx';
import { hasChildren, isLeafNode, leafNodes } from '../../../utils/scheduler.js';
import { getLineColor } from '../../../utils/roadmap.js';
import { progressPctLabel } from '../../../utils/progress.js';
import { statusChangePatch } from '../../../utils/completion.js';
import { currentPhase, setPhaseCursor, statusFromPhases, phaseProgress } from '../../../utils/phases.js';
import { GT_ICON } from '../../../constants.js';
import { localDate } from '../../../utils/date.js';
import { hasChain, chainShorts, chainTooltip } from '../../../utils/handoff.js';
import { withKey } from '../../../utils/shortcuts.js';
import { depth } from '../../../utils/tree/layout.js';

// Priority indicator: chevron-style glyphs (up = urgent, down = low)
// Four marks from one family. Priority 1 used to be a media-control glyph, which macOS and
// Windows render from the EMOJI font — a blue box with a white arrow sitting
// among three flat geometric shapes, which is why it read as a stray sticker
// in every row it appeared in. All four come from the text font now.
// Chevrons, the way every issue tracker draws priority: up for "ahead of the
// rest", a level bar for the middle, down for "can wait". The direction
// carries the meaning without the colour, which four coloured dots would not.
const PRIO_ICON = { 1: 'prioCritical', 2: 'prioHigh', 3: 'prioMedium', 4: 'prioLow' };
const PRIO_COL = { 1: 'var(--re)', 2: 'var(--am)', 3: 'var(--ac)', 4: 'var(--tx3)' };

// The editable cells of a row, keyed by the column they live in. Each is
// a SearchSelect rather than a <select> so typing filters: with a dozen
// teams, hunting a native dropdown by eye is the slow path. No labels —
// the column head above says what the cell is; the name doubles as the
// accessible label.
function editFieldsFor(r, c) {
  const { t, writeFieldWhileEditing, statusLbl, prioLbl, teams, sizeCatalogue } = c;
  // A task with phases derives its status FROM them, so a Status dropdown
  // would write a value the next read overwrites. The cell becomes the
  // phase list instead: it shows where the task stands, and Space walks
  // the same sequence one step at a time.
  const statusField = r.phases?.length
    ? {
        key: 'phase',
        column: 'progress',
        label: t('tv.fldPhase'),
        value: currentPhase(r.phases)?.id || '',
        options: r.phases.map(ph => ({
          id: ph.id,
          label: `${ph.status === 'done' ? '●' : ph.status === 'wip' ? '◐' : '○'} ${ph.name || ph.id}`,
        })),
        emptyLabel: t('tv.phaseAllDone'),
        onSelect: v => {
          const phases = v ? setPhaseCursor(r.phases, v) : r.phases.map(ph => ({ ...ph, status: 'done' }));
          if (!phases) return;
          const st = statusFromPhases(phases);
          writeFieldWhileEditing({ ...statusChangePatch(r, st), phases, progress: phaseProgress(phases) });
        },
      }
    : {
        key: 'status',
        column: 'progress',
        label: t('tv.fldStatus'),
        value: r.status || 'open',
        options: ['open', 'wip', 'done'].map(st => ({ id: st, label: statusLbl[st] })),
        onSelect: v => writeFieldWhileEditing(statusChangePatch(r, v)),
      };
  const fields = [
    {
      key: 'team',
      column: 'team',
      label: t('tv.fldTeam'),
      value: r.team || '',
      options: (teams || []).map(tm => ({ id: tm.id, label: tm.name })),
      emptyLabel: t('tv.teamNone'),
      onSelect: v => writeFieldWhileEditing({ team: v || '' }),
    },
    // The priority is drawn in the signal column, so that is where it is set.
    {
      key: 'prio',
      column: 'signal',
      label: t('tv.fldPrio'),
      value: r.prio ? String(r.prio) : '',
      options: [1, 2, 3, 4].map(pv => ({ id: String(pv), label: prioLbl[pv] })),
      // A row you just typed has no priority yet — say so, rather than
      // pre-filling one and calling it a decision.
      emptyLabel: t('tv.prioNone'),
      onSelect: v => writeFieldWhileEditing({ prio: v ? Number(v) : undefined }),
    },
    {
      key: 'size',
      column: 'effort',
      label: t('tv.fldSize'),
      value: sizeCatalogue.find(sz => sz.days === r.best && sz.factor === r.factor)?.label || '',
      options: sizeCatalogue.map(sz => ({ id: sz.label, label: `${sz.label} · ${sz.days}d` })),
      // An estimate from the wizard matches no catalogue entry — say so
      // rather than showing the nearest size.
      emptyLabel: t('tv.sizeCustom'),
      onSelect: v => {
        const sz = sizeCatalogue.find(x => x.label === v);
        if (sz) writeFieldWhileEditing({ best: sz.days, factor: sz.factor });
      },
    },
    statusField,
  ];
  return Object.fromEntries(fields.map(f => [f.column, f]));
}

// One editable cell. Tab order is the column order — name, team,
// priority, size, status — which is the order they sit in on screen.
function editCell(f, isLast, c) {
  const { handleFieldKeyDown, teamSelRef } = c;
  if (!f) return null;
  return (
    <span
      className="tv-cell-edit"
      onClick={e => e.stopPropagation()}
      // SearchSelect owns ↑/↓/Enter/Esc while its popup is open and calls
      // preventDefault when it acts, so the row-level keys run only on what
      // it left alone.
      onKeyDown={e => {
        if (!e.defaultPrevented) handleFieldKeyDown(e, isLast);
      }}
    >
      <SearchSelect
        compact
        testId={`tree-edit-${f.key}`}
        ariaLabel={f.label}
        inputRef={f.key === 'team' ? teamSelRef : undefined}
        value={f.value}
        options={f.options}
        allowEmpty={!!f.emptyLabel}
        emptyLabel={f.emptyLabel}
        onSelect={f.onSelect}
      />
    </span>
  );
}

// The row itself. Called only for rows whose signature changed — see
// the cache at the call site.
export function renderTreeRow(r, idx, c) {
  const {
    cancelEdit,
    changedIds,
    collapsed,
    computeDiffBadge,
    containerRef,
    cpLabels,
    cpSet,
    customFields,
    editInputRef,
    editing,
    filt,
    finishEditing,
    firstMatchRef,
    fmtDate,
    handleEditKeyDown,
    handleEditorFocusOut,
    memberFullName,
    memberShort,
    multiSel,
    onDropRows,
    onFullEdit,
    onOrderDragOver,
    onOrderDrop,
    onRowDragStart,
    onSelect,
    orderDrop,
    prioLbl,
    roadmapAssignment,
    sMap,
    scheduleRangeById,
    search,
    selRef,
    selected,
    setEditing,
    setOrderDrop,
    shortMap,
    showIds,
    startEdit,
    startNewChild,
    startNewSibling,
    stats,
    statusLbl,
    t,
    teamColor,
    teamName,
    toggle,
    tree,
    visibleIds,
  } = c;
  const s = stats[r.id] || r;
  const isLeaf = isLeafNode(tree, r.id);
  const isCp = isLeaf && cpSet?.has(r.id);
  const childNodes = hasChildren(tree, r.id);
  const isCollapsed = collapsed.has(r.id);
  const d = depth(r.id);
  const isMulti = multiSel?.has(r.id);
  const effStatus = isLeaf ? r.status : s._autoStatus || r.status || 'open';
  const assignees = r.assign || [];
  const tColor = r.team ? teamColor(r.team) : null;
  const tName = r.team ? teamName(r.team) : '';
  const prog = s._progress || 0;
  const effortDays = isLeaf ? (s._r > 0 ? s._r.toFixed(1) : '') : s._r > 0 ? s._r.toFixed(0) + 'd' : '';
  // Always show team when set. Hiding inherited teams (parent matches)
  // saved a few pixels but made it impossible to read team assignment
  // at a glance on deep leaves where the parent label sat far away.
  const showTeam = !!r.team;
  const cpTip = isCp && cpLabels[r.id]?.length ? cpLabels[r.id].join(', ') : null;
  // Diff-since badge — shared helper keeps the same rule used by the
  // "only with changes" filter so the two views stay in sync.
  const diffBadge = computeDiffBadge(r);
  const dropHere = orderDrop?.targetId === r.id && orderDrop.valid ? orderDrop.position : '';
  const inHand = !!orderDrop?.dragIds?.includes(r.id);
  // Subway-Map line color for root items — same hex the Roadmap view
  // assigns to the line's start/end badges. Falls back to null when no
  // assignment has been computed yet (user hasn't opened Subway view).
  // For child rows we colorize the leading root segment of the id
  // (e.g. the "P1" in "P1.2.3") so the chain back to the line stays
  // visible without spamming color on every cell.
  const rootIdSeg = r.id.split('.')[0];
  const lineColor = getLineColor(rootIdSeg, roadmapAssignment);
  // In edit mode the row stays the row: same indentation, same
  // columns, each value swapped for its control in place.
  const isEditingRow = editing?.id === r.id;
  const edit = isEditingRow ? editFieldsFor(r, c) : null;
  const lastEditCol = edit ? ['progress', 'effort', 'signal', 'team'].find(c => edit[c]) : null;
  return (
    <tr
      key={r.id}
      ref={selected?.id === r.id ? selRef : search && idx === 0 ? firstMatchRef : null}
      className={`tr${isLeaf ? '' : d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}${idx % 2 ? ' alt' : ''}${selected?.id === r.id || isMulti ? ' sel' : ''}${isCp ? ' cp-row' : ''}${changedIds?.has(r.id) ? ' scn-row' : ''}`}
      data-prio={r.prio || ''}
      data-dropped={r.dropped ? 'true' : undefined}
      data-status={effStatus}
      data-team={r.team || ''}
      data-editing={isEditingRow ? 'true' : undefined}
      onBlur={isEditingRow ? handleEditorFocusOut : undefined}
      onClick={e => {
        if (isEditingRow) return;
        onSelect(
          r,
          e,
          filt.map(x => x.id),
        );
        containerRef.current?.focus();
      }}
      draggable={!!onDropRows && !isEditingRow}
      onDragStart={e => onRowDragStart(e, r)}
      onDragEnd={() => setOrderDrop(null)}
      onDragOver={e => onOrderDragOver(e, r.id)}
      onDragLeave={() => setOrderDrop(prev => (prev?.targetId === r.id ? { ...prev, targetId: null, position: null, valid: false } : prev))}
      onDrop={e => onOrderDrop(e, r.id)}
      data-dragging={inHand ? 'true' : undefined}
      data-drop={dropHere || undefined}
    >
      {/* ID column — when on critical path, show CP labels via tooltip on the critical-path marker */}
      <td {...(cpTip ? { 'data-htip': `${t('tv.criticalPath')}: ${cpTip}` } : {})}>
        {/* The grip is the cue; the whole row drags (onRowDragStart). */}
        {onDropRows && (
          <span className="tv-drag-handle" data-htip={t('tv.dragTip', r.id)}>
            <Icon name="grip" size={11} />
          </span>
        )}
        {/* The id is the tool's spine — dependencies, the tooltip and
                every export speak it — and on a narrow screen it is also
                five dotted segments in front of every name you are trying
                to read. Hiding it keeps the drag handle and the column;
                the id stays one selection away, in the bar and the editor. */}
        {showIds &&
          (d === 1 && lineColor ? (
            <span
              className="tid"
              style={{
                background: lineColor,
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 3,
                fontWeight: 700,
                letterSpacing: '.02em',
              }}
              data-htip={t('tv.lineTip', rootIdSeg)}
            >
              {r.id}
            </span>
          ) : lineColor ? (
            <span className="tid">
              <span style={{ color: lineColor, fontWeight: 600 }}>{rootIdSeg}</span>
              {r.id.slice(rootIdSeg.length)}
            </span>
          ) : (
            <span className="tid">{r.id}</span>
          ))}
      </td>

      {/* Name column — flex container so badges wrap as a single trailing
              group instead of breaking individually under the name when the row
              runs out of horizontal space. */}
      <td data-col="name" style={{ whiteSpace: 'normal' }}>
        {/* nowrap + min-width:0 is what actually keeps a row one line
                tall. The badges after the name used to be allowed to wrap
                under it, which meant a long name pushed them down and took
                the row with it — and without min-width:0 a flex item never
                shrinks below its content, so the name overflowed the cell
                instead of ellipsising inside it. The badges now shrink
                away; the name never does. */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, minWidth: 0 }}>
          <span style={{ display: 'inline-block', width: (d - 1) * 20, flexShrink: 0 }} />
          {childNodes ? (
            <span
              data-testid={`tree-caret-${r.id}`}
              data-open={isCollapsed ? 'false' : 'true'}
              style={{
                display: 'inline-flex',
                width: 14,
                cursor: 'pointer',
                color: 'var(--tx3)',
                userSelect: 'none',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
              }}
              // Folding a branch selects it as well. The triangle is only
              // drawn on a row that has children, and it used to stop the
              // click before the row's own handler ran — so the most
              // natural thing to click on a parent was the one thing that
              // left the cursor on whatever was selected before, and the
              // next keystroke went somewhere else entirely. It stops
              // propagation (a second click on the name would open the
              // rename editor) and does the selecting itself.
              onClick={e => {
                e.stopPropagation();
                onSelect(
                  r,
                  {},
                  filt.map(x => x.id),
                );
                containerRef.current?.focus();
                toggle(r.id);
              }}
            >
              <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={11} strokeWidth={2.2} />
            </span>
          ) : (
            <span style={{ display: 'inline-block', width: 14, flexShrink: 0 }} />
          )}

          {/* Status icon — SVG matching the network graph's symbology */}
          <span style={{ display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} data-htip={statusLbl[effStatus]}>
            <StatusIcon status={effStatus} progress={prog} />
          </span>

          {/* Root type emoji */}
          {d === 1 && r.type && (
            <span style={{ marginRight: 5, display: 'inline-flex', color: 'var(--tx3)' }}>
              <Icon name={GT_ICON[r.type]} size={12} />
            </span>
          )}

          {/* Name — a real <input> while this row is the keyboard editor's
                active edit (see handleContainerKeyDown's Enter/⇧Enter and
                the commit/cancel helpers in useTreeEditing.js). */}
          {isEditingRow ? (
            <input
              ref={editInputRef}
              className="tn-edit-input"
              value={editing.draft}
              data-testid={`tree-name-input-${r.id}`}
              onChange={e => {
                const v = e.target.value;
                setEditing(cur => (cur ? { ...cur, draft: v } : cur));
              }}
              aria-label={t('col.name')}
              onKeyDown={handleEditKeyDown}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className={`tn tn-editable${d <= 1 ? ' l1' : d <= 2 ? ' l2' : ''}`}
              data-testid="tree-row-name"
              data-htip={selected?.id === r.id ? t('tv.clickToRename') : undefined}
              onClick={e => {
                // First click selects the row (the <tr> handler), a click
                // on the name of the row that is ALREADY selected opens
                // the editor. Finder's rename gesture — and it leaves
                // click/⇧-click selection of other rows untouched.
                if (selected?.id !== r.id || isMulti) return;
                e.stopPropagation();
                startEdit(r.id);
              }}
            >
              {r.name || <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>{t('tv.unnamed')}</span>}
            </span>
          )}

          {/* Team — small colored dot + name (subtle). Suppressed when team equals
                the inherited parent team to avoid repeating the same label down a subtree. */}
          {/* Collapsed children count */}
          {/* Collapsed leaf count comes from stats, which is built on the
                UNFILTERED tree. Counting the local `tree` prop instead
                reported the post-filter remainder ("30 leafs" for a 51-leaf
                package with hide-done on) next to a full-tree percentage. */}
          {isCollapsed &&
            (() => {
              const visibleLeaves = leafNodes(tree).filter(c => c.id.startsWith(r.id + '.')).length;
              const allLeaves = s._leafCount ?? visibleLeaves;
              return (
                <span
                  style={{ marginLeft: 8, fontSize: 10, color: 'var(--tx3)', fontFamily: 'var(--mono)' }}
                  data-htip={visibleLeaves < allLeaves ? `${visibleLeaves} ${t('tv.ofVisible')} ${allLeaves}` : null}
                >
                  {t('tv.leafCount', allLeaves)}
                  {visibleLeaves < allLeaves ? `, ${visibleLeaves} ${t('tv.visible')}` : ''}
                </span>
              );
            })()}
        </div>
      </td>

      {/* Team, who, and the signals: a column each, so a row with
              nothing to show still occupies the same slots and the columns
              after it do not move. This is the whole fix — everything here
              used to trail behind the name with `marginLeft: 8`, eleven
              optional things deep, and no two rows ended in the same place. */}
      <td data-col="team" className="nc" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
        {edit
          ? editCell(edit.team, lastEditCol === 'team', c)
          : tName &&
            showTeam && (
              <span
                style={{ marginLeft: 8, fontSize: 11, color: tColor, fontWeight: 500, opacity: 0.85 }}
                data-htip={`${t('tv.team')}: ${tName}`}
              >
                ● {tName}
              </span>
            )}
      </td>
      <td data-col="who" className="nc" style={{ whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'var(--mono)' }}>
        {/* Assignees — initials, with handoff chain appended when the
                scheduler split work across multiple people. */}
        {assignees.length > 0 &&
          (() => {
            const sc = sMap[r.id];
            const primary = assignees.map(memberShort).join(' ');
            const chain = hasChain(sc);
            const label = chain ? chainShorts(sc, shortMap, primary) : primary;
            const tip = chain ? chainTooltip(sc, memberFullName) : assignees.map(memberFullName).join(', ');
            return <PersonChip chain={!!chain} short={label} title={tip} style={{ marginLeft: 8 }} />;
          })()}
        {/* Auto-assigned suggestion from scheduler */}
        {assignees.length === 0 &&
          sMap[r.id]?.autoAssigned &&
          sMap[r.id]?.personId &&
          (() => {
            const sc = sMap[r.id];
            const primary = memberShort(sc.personId);
            const label = hasChain(sc) ? chainShorts(sc, shortMap, primary) : primary;
            const tip = hasChain(sc) ? chainTooltip(sc, memberFullName) : `${t('aa.suggestion')} ${memberFullName(sc.personId)}`;
            return <PersonChip auto short={label} title={tip} style={{ marginLeft: 8 }} />;
          })()}

        {/* Priority — chevron icon for all leaves */}
      </td>
      <td data-col="signal" className="nc" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
        {edit && editCell(edit.signal, lastEditCol === 'signal', c)}
        {!edit && isLeaf && r.prio && (
          <span
            style={{ marginLeft: 8, color: PRIO_COL[r.prio], display: 'inline-flex' }}
            data-htip={`${t('tv.priority')}: ${prioLbl[r.prio]}`}
          >
            <Icon name={PRIO_ICON[r.prio]} size={13} strokeWidth={2.2} />
          </span>
        )}

        {/* Severity for roots */}
        {/* Diff-since badge (newly done / new leaf / progress jump) */}
        {diffBadge && (
          <span
            data-htip={diffBadge.tip}
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 3,
              background:
                diffBadge.kind === 'new' ? 'var(--diff)' : diffBadge.kind === 'done' ? 'rgba(16,185,129,.85)' : 'rgba(245,158,11,.85)',
              color: '#1a1a1a',
              fontFamily: 'var(--mono)',
            }}
          >
            {diffBadge.label}
          </span>
        )}
        {/* Custom field indicator — show link icon if any uri field has a value */}
        {customFields?.length > 0 &&
          (() => {
            const vals = r.customValues || {};
            const filledUriFields = customFields.filter(cf => cf.type === 'uri' && vals[cf.id]);
            const filledOtherFields = customFields.filter(cf => cf.type !== 'uri' && vals[cf.id] != null && vals[cf.id] !== '');
            if (!filledUriFields.length && !filledOtherFields.length) return null;
            const tipParts = [
              ...filledUriFields.map(cf => `${cf.name}: ${vals[cf.id]}`),
              ...filledOtherFields.map(cf => `${cf.name}: ${vals[cf.id]}`),
            ];
            return (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--tx3)', opacity: 0.8 }} data-htip={tipParts.join(' · ')}>
                {filledUriFields.length > 0 && '↗'}
                {filledOtherFields.length > 0 && filledUriFields.length === 0 && '·'}
              </span>
            );
          })()}
      </td>
      {/* Description and note are hidden in tree view; visible in QuickEdit/NodeModal. */}
      {/* Effort: single number (realistic days) */}
      <td data-col="effort" className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isLeaf ? 'var(--gr)' : 'var(--tx2)' }}>
        {edit ? editCell(edit.effort, lastEditCol === 'effort', c) : effortDays}
      </td>

      {/* Progress */}
      <td
        data-col="progress"
        className="nc"
        style={{ fontFamily: 'var(--mono)', fontSize: 11, color: prog >= 99.95 ? 'var(--gr)' : prog > 0 ? 'var(--am)' : 'var(--tx3)' }}
      >
        {edit ? editCell(edit.progress, lastEditCol === 'progress', c) : prog > 0 ? `${progressPctLabel(prog)}%` : ''}
      </td>

      {/* Schedule range — start to end */}
      <td data-col="schedule" className="nc" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
        {/* A due date is a date, so it belongs in the column about dates,
                and it turns red once the schedule runs past it. Behind the
                name it was one more thing pushing the next marker sideways. */}
        {r.due &&
          (() => {
            const endIso = scheduleRangeById[r.id]?.end || null;
            const overdue = r.status !== 'done' && endIso && endIso > r.due;
            return (
              <span
                style={{ marginRight: 6, color: overdue ? 'var(--re)' : 'var(--am)', fontWeight: overdue ? 700 : 400 }}
                data-htip={overdue ? t('tv.dueOverdueTip', r.due, endIso) : t('tv.dueTip', r.due)}
              >
                {fmtDate(localDate(r.due))} ·
              </span>
            );
          })()}
        {scheduleRangeById[r.id]?.start && scheduleRangeById[r.id]?.end && (
          <>
            {fmtDate(scheduleRangeById[r.id].start)} → {fmtDate(scheduleRangeById[r.id].end)}
          </>
        )}
      </td>

      {/* Actions — the three creation/rename moves, on the row itself.
              They fade in with the row (CSS .tv-row-act) so a resting table
              stays quiet, and each one is the same callback the keyboard
              uses. Reorder, indent and delete live in the contextual
              toolbar above and act on the selected item. */}
      <td data-col="acts" style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '0 4px' }}>
        {/* Save / cancel for the mouse. Out of the Tab order: Tab walks
                the fields, Enter and Esc are these two buttons. */}
        {isEditingRow ? (
          <span className="tv-row-act tv-row-act-edit">
            <button
              className="tv-act-btn"
              tabIndex={-1}
              data-testid={`tree-edit-save-${r.id}`}
              aria-label={t('tv.editSave')}
              data-htip={`${t('tv.editSave')} · ↵`}
              onMouseDown={e => e.preventDefault()}
              onClick={e => {
                e.stopPropagation();
                finishEditing();
              }}
            >
              <Icon name="check" size={12} />
            </button>
            <button
              className="tv-act-btn"
              tabIndex={-1}
              data-testid={`tree-edit-cancel-${r.id}`}
              aria-label={t('tv.editCancel')}
              data-htip={`${t('tv.editCancel')} · Esc`}
              onMouseDown={e => e.preventDefault()}
              onClick={e => {
                e.stopPropagation();
                cancelEdit();
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ) : (
          <span className="tv-row-act">
            {/* Open this row in the editor. The standard move for a table
                  row, and the one path that does not depend on there being
                  a panel on the right: with the editor docked as a dialog
                  it is how you get to it at all. */}
            {onFullEdit && (
              <button
                className="tv-act-btn"
                data-testid={`tree-row-edit-${r.id}`}
                data-htip={withKey(t('tv.editRowTip', r.id), 'fullEdit')}
                onClick={e => {
                  e.stopPropagation();
                  onSelect(r, {}, visibleIds);
                  onFullEdit(r);
                }}
              >
                <Icon name="maximize" size={12} />
              </button>
            )}
            <button
              className="tv-act-btn"
              data-testid={`tree-row-rename-${r.id}`}
              data-htip={withKey(t('tv.renameTip', r.id), 'rename')}
              onClick={e => {
                e.stopPropagation();
                onSelect(r, {}, visibleIds);
                startEdit(r.id);
              }}
            >
              <Icon name="pencil" size={12} />
            </button>
            <button
              className="tv-act-btn"
              data-testid={`tree-row-add-sibling-${r.id}`}
              data-htip={withKey(t('tv.newRowTip', r.id), 'newRow')}
              onClick={e => {
                e.stopPropagation();
                startNewSibling(r.id);
              }}
            >
              <Icon name="plus" size={12} />
            </button>
            <button
              className="tv-act-btn"
              data-testid={`tree-row-add-child-${r.id}`}
              data-htip={withKey(t('tv.newChildTip', r.id), 'newChild')}
              onClick={e => {
                e.stopPropagation();
                startNewChild(r.id);
              }}
            >
              <Icon name="subtask" size={12} />
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}
