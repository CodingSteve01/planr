// Left column of the Gantt: the sticky task/group labels with their expand, drag and
// hover affordances. Stateless; the parent owns every handler and ref.

import { Icon } from '../../shared/Icon.jsx';

import { StatusIcon } from '../../shared/StatusIcon.jsx';
import { CriticalPathBadge } from '../../shared/CriticalPathBadge.jsx';
import { PersonChip } from '../../shared/PersonChip.jsx';

export function GanttLabelColumn({
  lR,
  syncL,
  onLWheel,
  FLAG_ROW_H,
  visibleRows,
  collapsed,
  compact,
  rowDepth,
  rowIsCp,
  cpOnly,
  rowRelevantToCp,
  RH,
  t,
  toggleCollapse,
  personQueues,
  hoverDepId,
  hoverLines,
  searchMatches,
  activeMatchId,
  rowKeyOf,
  cursorId,
  dragRef,
  drag,
  linkDrag,
  showRowTip,
  hideRowTip,
  handleSelectClick,
  openRowItem,
  cpLabels,
  snAll,
  members,
  rowLayout,
  bodyScrollbarH,
}) {
  return (
    <div ref={lR} className="gantt-left" style={{ overflowY: 'hidden' }} onScroll={syncL} onWheel={onLWheel}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 8,
          height: FLAG_ROW_H,
          borderBottom: '1px solid var(--b)',
          background: 'var(--bg)',
        }}
      />
      {(() => {
        let _taskIdx = 0;
        return visibleRows.map((row, _ri) => {
          // In compact a row is a lane, so the only things that still own one
          // are the grouping's own containers — the project, the team, the
          // person, the thread, whichever the pills chose. Task rows and the
          // work packages between them do not: several of them share a lane,
          // and a label per task would name rows that no longer correspond to
          // them. The names live on the bars there.
          const _folded = row.type !== 'task' && !!row.children?.length && collapsed.has(row.collapseKey || row.key);
          if (compact && (row.type === 'task' || ((rowDepth.get(row) ?? 0) > 0 && !_folded))) return null;
          const _el = (() => {
            if (row.type === 'group') {
              const isCol = collapsed.has(row.collapseKey || row.key);
              const isCp = rowIsCp(row);
              const dim = cpOnly && !rowRelevantToCp(row);
              return (
                <div
                  key={row.key}
                  className="gteam"
                  style={{
                    color: isCp ? 'var(--re)' : row.color,
                    borderLeft: `3px solid ${isCp ? 'var(--re)' : row.color}`,
                    background: isCp ? 'rgba(127,16,18,.06)' : 'var(--bg2)',
                    paddingLeft: 6,
                    height: RH,
                    cursor: 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4, // Sentence case. A group header is a person's or a project's NAME
                    // — uppercase with letter-spacing is a label style, and on a
                    // real plan it made every name both wider and harder to read
                    // for no gain. The colour bar on the left already says "this
                    // is a header".
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: '.005em',
                    opacity: dim ? 0.25 : 1,
                  }}
                >
                  <button
                    type="button"
                    aria-label={isCol ? t('tv.expandAll') : t('tv.collapseAll')}
                    onClick={e => {
                      e.stopPropagation();
                      toggleCollapse(row.collapseKey || row.key);
                    }}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      color: 'var(--tx3)',
                      width: 12,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name={isCol ? 'chevronRight' : 'chevronDown'} size={11} strokeWidth={2.2} />
                  </button>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                  {/* Read-only, and worth the two words: this person's bars sit in
                an order they were given rather than the plan's, and without
                the note nothing on this screen would explain that. Changing
                it happens in the Work order view, which is flat — a queue
                shown as a project hierarchy is not a queue. */}
                  {row.personId && personQueues?.[row.personId] && (
                    <span
                      data-testid={`queue-sorted-${row.personId}`}
                      data-htip={t('g.queueSortedTip')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        marginRight: 6,
                        padding: '0 5px',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 0,
                        textTransform: 'none',
                        color: 'var(--tx2)',
                        background: 'var(--bg3)',
                        border: '1px solid var(--b2)',
                        borderRadius: 3,
                      }}
                    >
                      {t('g.queueSorted')}
                    </span>
                  )}
                  {/* What a group header is for: how much work is in it, how much
                of it is behind you, and how much effort it carries. The
                header used to say only its own name and a count, so reading
                "is this team ahead or behind" meant collapsing it and
                adding up. All three in mono, right-aligned, quiet — the
                name is what should still be the loudest thing in the row. */}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      marginRight: 8,
                      fontSize: 11,
                      fontWeight: 400,
                      fontFamily: 'var(--mono)',
                      color: 'var(--tx3)',
                      letterSpacing: 0,
                    }}
                  >
                    {row.s?._doneCount != null && row.count > 0 && (
                      <span data-htip={t('g.groupDoneTip')}>
                        {row.s._doneCount}/{row.count}
                      </span>
                    )}
                    {row.s?.effort > 0 && <span data-htip={t('g.groupEffortTip')}>{Math.round(row.s.effort)} PT</span>}
                    {row.s?.progress > 0 && (
                      <span style={{ color: row.s.progress >= 99.95 ? 'var(--st-done)' : 'var(--tx2)' }}>
                        {Math.round(row.s.progress)}%
                      </span>
                    )}
                  </span>
                </div>
              );
            }
            const s = row.s;
            const isSummary = row.type === 'summary';
            const isCp = rowIsCp(row);
            const dim = cpOnly && !rowRelevantToCp(row);
            const indent = row.level * 6;
            const isHovDep = hoverDepId && hoverLines.rowIds.has(s.id) && s.id !== hoverDepId;
            const isHov = hoverDepId === s.id;
            const isMatchL = searchMatches?.has(s.id);
            const isActiveMatchL = s.id === activeMatchId;
            const searchDimmedL = searchMatches && searchMatches.size > 0 && !isMatchL;
            const statusProgress = s.progress ?? row.node?.progress ?? (s.status === 'done' ? 100 : s.status === 'wip' ? 50 : 0);
            const isCollapsed = !!row.collapseKey && collapsed.has(row.collapseKey);
            const _alt = _taskIdx++ % 2 === 1;
            return (
              <div
                key={rowKeyOf(row)}
                data-task-id={row.type === 'task' ? s.treeId || s.id : undefined}
                data-gantt-cursor={cursorId && (s.treeId || s.id) === cursorId ? '1' : undefined}
                className={`grow-l${isCp ? ' cp-row' : ''}${_alt ? ' alt' : ''}${cursorId && (s.treeId || s.id) === cursorId ? ' cursor-row' : ''}`}
                style={{
                  height: RH,
                  cursor: 'pointer',
                  opacity: dim ? 0.25 : searchDimmedL ? 0.35 : s._unestimated ? 0.55 : 1,
                  paddingLeft: 10 + indent,
                  background: isActiveMatchL
                    ? 'rgba(59,130,246,.15)'
                    : isCp
                      ? 'rgba(127,16,18,.06)'
                      : isHov
                        ? 'rgba(127,127,127,.10)'
                        : isHovDep
                          ? 'rgba(127,127,127,.05)'
                          : '',
                }}
                onMouseEnter={e => {
                  if (dragRef.current || drag || linkDrag) return;
                  showRowTip(row, e, !isSummary);
                }}
                onMouseLeave={() => hideRowTip(row, !isSummary)}
                onClick={e => {
                  if (row.type === 'task' && handleSelectClick(e, s.treeId || s.id)) return;
                  openRowItem(row);
                }}
              >
                {isSummary && (
                  <button
                    type="button"
                    aria-label={isCollapsed ? t('tv.expandAll') : t('tv.collapseAll')}
                    onClick={e => {
                      e.stopPropagation();
                      toggleCollapse(row.collapseKey);
                    }}
                    style={{
                      appearance: 'none',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      color: 'var(--tx3)',
                      width: 12,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={11} strokeWidth={2.2} />
                  </button>
                )}
                <StatusIcon status={s.status} progress={statusProgress} style={{ flexShrink: 0 }} />
                {isCp && <CriticalPathBadge id={s.id} labels={cpLabels} compact style={{ flexShrink: 0 }} />}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isSummary ? 600 : 400,
                    color: isSummary ? 'var(--tx)' : 'var(--tx2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: s.status === 'done' ? 'line-through' : 'none',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {s.name}
                </span>
                {/* "kein Aufwand" used to be a full amber badge on every such row.
              On the real plan that is nine identical pills down one group,
              shouting the same thing nine times and drowning out the names
              beside them. The count is already on the footer bar and in the
              quick filters; here it only has to mark the row, so it is a
              mark. */}
                {!isSummary &&
                  (s._unestimated ? (
                    <span
                      data-htip={t('g.noEstimate')}
                      style={{
                        marginLeft: 'auto',
                        flexShrink: 0,
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        color: 'var(--st-wip)',
                        letterSpacing: '.08em',
                      }}
                    >
                      —
                    </span>
                  ) : s.autoAssigned ? (
                    <PersonChip
                      auto
                      short={snAll(s)}
                      title={`${t('aa.suggestion')} ${s.person || ''}`}
                      style={{ flexShrink: 0, marginLeft: 'auto' }}
                    />
                  ) : (
                    <PersonChip
                      short={snAll(s)}
                      style={{ flexShrink: 0, marginLeft: 'auto' }}
                      title={(s.assign || []).map(id => members.find(m => m.id === id)?.name || id).join(', ') || s.person}
                    />
                  ))}
              </div>
            );
          })();
          if (!compact || !_el) return _el;
          // Next row that gets a label of its own; everything between is a
          // lane and its height belongs to this block.
          //
          // "Everything between" has to mean every row compact hides, and that
          // is not only the tasks: the work packages inside a group are hidden
          // too. Skipping only the tasks made this stop at the first package,
          // whose top is the top of the group's lane area — so the block was
          // one row tall, every label after it slid up, and the two columns
          // came apart by a little more with each group.
          const _hidden = r =>
            r.type === 'task' ||
            ((rowDepth.get(r) ?? 0) > 0 && !(r.type !== 'task' && !!r.children?.length && collapsed.has(r.collapseKey || r.key)));
          let _next = _ri + 1;
          while (_next < visibleRows.length && _hidden(visibleRows[_next])) _next++;
          const _h = (_next < visibleRows.length ? rowLayout.tops[_next] : rowLayout.height) - rowLayout.tops[_ri];
          return (
            <div key={`lane-block-${_ri}`} style={{ height: Math.max(RH, _h), overflow: 'hidden' }}>
              {_el}
            </div>
          );
        });
      })()}
      {bodyScrollbarH > 0 && <div style={{ height: bodyScrollbarH, borderTop: '1px solid var(--b)', background: 'var(--bg)' }} />}
    </div>
  );
}
