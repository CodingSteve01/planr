import { useMemo, useState } from 'react';
import { leafNodes, isLeafNode, re, parentId } from '../../utils/scheduler.js';
import { iso, diffDays } from '../../utils/date.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';

const CL = { committed: '●', estimated: '◐', exploratory: '○' };
const CC = { committed: 'var(--gr)', estimated: 'var(--am)', exploratory: 'var(--tx3)' };
const CN = { committed: 'Committed', estimated: 'Estimated', exploratory: 'Exploratory' };

export function PlanReview({ tree, scheduled, members, teams, confidence, cpSet, stats, onNavigate, onUpdate }) {
  const [filter, setFilter] = useState('all'); // all | needs-attention | exploratory | estimated
  const now = new Date();
  const iMap = useMemo(() => Object.fromEntries(tree.map(r => [r.id, r])), [tree]);
  const sMap = useMemo(() => Object.fromEntries(scheduled.map(s => [s.id, s])), [scheduled]);
  const leaves = useMemo(() => leafNodes(tree), [tree]);

  // Build attention items: tasks that need planning decisions
  const attentionItems = useMemo(() => {
    const items = [];
    leaves.forEach(r => {
      if (r.status === 'done') return;
      const conf = confidence[r.id] || 'committed';
      const sc = sMap[r.id];
      const startDate = sc?.startD;
      const weeksUntilStart = startDate ? diffDays(now, startDate) / 7 : null;
      const isCp = cpSet?.has(r.id);

      // Determine urgency and what action is needed
      const actions = [];
      const hasAssign = (r.assign || []).length > 0;
      const hasEstimate = r.best > 0;
      const highRisk = (r.factor || 1.5) >= 2.0;

      if (!hasEstimate) actions.push('needs estimate');
      if (!hasAssign && hasEstimate) actions.push('needs person');
      if (highRisk) actions.push('high risk (×' + (r.factor || 1.5).toFixed(1) + ')');
      if (conf === 'exploratory' && hasEstimate) actions.push('scope unclear — concept phase?');

      // Urgency score: lower = more urgent
      let urgency = 100;
      if (weeksUntilStart !== null && weeksUntilStart < 8 && conf !== 'committed') urgency = Math.max(0, weeksUntilStart);
      if (isCp && conf !== 'committed') urgency -= 20;
      if (conf === 'exploratory') urgency -= 10;

      if (actions.length > 0) {
        items.push({
          id: r.id, name: r.name, team: r.team, conf, actions,
          urgency, weeksUntilStart, isCp, startDate,
          assign: r.assign, best: r.best, factor: r.factor,
        });
      }
    });
    return items.sort((a, b) => a.urgency - b.urgency);
  }, [leaves, confidence, sMap, cpSet, now]);

  const filtered = useMemo(() => {
    if (filter === 'all') return attentionItems;
    if (filter === 'needs-attention') return attentionItems.filter(i => i.weeksUntilStart !== null && i.weeksUntilStart < 8);
    return attentionItems.filter(i => i.conf === filter);
  }, [attentionItems, filter]);

  // Summary counts
  const confCounts = useMemo(() => {
    const c = { committed: 0, estimated: 0, exploratory: 0 };
    leaves.filter(r => r.status !== 'done').forEach(r => c[confidence[r.id] || 'committed']++);
    return c;
  }, [leaves, confidence]);

  const teamName = id => teams.find(t => t.id === id)?.name || id || 'No team';
  const memberName = id => members.find(m => m.id === id)?.name || id;

  return <div style={{ maxWidth: 900 }}>
    {/* Header with confidence breakdown */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {['committed', 'estimated', 'exploratory'].map(c => <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 14, color: CC[c] }}>{CL[c]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: CC[c] }}>{confCounts[c]}</span>
          <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{CN[c]}</span>
        </div>)}
      </div>
    </div>

    {/* Confidence bar */}
    {(() => {
      const total = confCounts.committed + confCounts.estimated + confCounts.exploratory;
      if (!total) return null;
      return <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 20, background: 'var(--bg4)' }}>
        <div style={{ width: `${confCounts.committed / total * 100}%`, background: 'var(--gr)', transition: 'width .3s' }} title={`${confCounts.committed} committed`} />
        <div style={{ width: `${confCounts.estimated / total * 100}%`, background: 'var(--am)', transition: 'width .3s' }} title={`${confCounts.estimated} estimated`} />
        <div style={{ width: `${confCounts.exploratory / total * 100}%`, background: 'var(--tx3)', transition: 'width .3s' }} title={`${confCounts.exploratory} exploratory`} />
      </div>;
    })()}

    {/* Filter tabs */}
    <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>Show</span>
      {[['all', `All (${attentionItems.length})`],
        ['needs-attention', 'Starting soon'],
        ['exploratory', `Exploratory (${confCounts.exploratory})`],
        ['estimated', `Estimated (${confCounts.estimated})`],
      ].map(([k, l]) =>
        <button key={k} className={`btn btn-xs ${filter === k ? 'btn-pri' : 'btn-sec'}`} style={{ padding: '2px 7px', fontSize: 10 }} onClick={() => setFilter(k)}>{l}</button>)}
    </div>

    {/* Items list */}
    {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--tx3)', padding: '40px 0' }}>
      {attentionItems.length === 0
        ? <><div style={{ fontSize: 24, marginBottom: 8 }}>All clear</div><div style={{ fontSize: 12 }}>Every open item is committed — person assigned, estimate solid.</div></>
        : <div style={{ fontSize: 12 }}>No items match this filter.</div>}
    </div>}

    {filtered.map(item => {
      const node = iMap[item.id];
      if (!node) return null;
      const team = teams.find(t => t.id === item.team);
      const borderC = item.isCp ? 'var(--re)' : CC[item.conf];
      const sc = sMap[item.id];

      return <div key={item.id} style={{
        background: 'var(--bg2)', border: '1px solid var(--b)', borderLeft: `3px solid ${borderC}`,
        borderRadius: 'var(--r)', padding: '12px 14px', marginBottom: 8,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: CC[item.conf] }}>{CL[item.conf]}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ac)', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => onNavigate?.(item.id, 'tree')}>{item.id}</span>
          <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          {item.isCp && <span className="badge b-cp" style={{ fontSize: 8 }}>CP</span>}
          {team && <span style={{ fontSize: 9, color: team.color, fontWeight: 500 }}>{team.name}</span>}
          {item.weeksUntilStart !== null && item.weeksUntilStart < 8 && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: item.weeksUntilStart < 3 ? 'var(--re)' : 'var(--am)' }}>
            starts in {Math.max(0, Math.round(item.weeksUntilStart))}w
          </span>}
        </div>

        {/* Action chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {item.actions.map((a, i) => <span key={i} style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: a.includes('needs person') ? 'rgba(59,130,246,.12)' : a.includes('needs estimate') ? 'rgba(245,158,11,.12)' : a.includes('scope') ? 'rgba(127,127,127,.12)' : 'rgba(244,63,94,.12)',
            color: a.includes('needs person') ? 'var(--ac)' : a.includes('needs estimate') ? 'var(--am)' : a.includes('scope') ? 'var(--tx2)' : 'var(--re)',
          }}>{a}</span>)}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Assign person */}
          {!(node.assign || []).length && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Assign:</span>
            <SearchSelect
              options={members.filter(m => !(node.assign || []).includes(m.id)).map(m => ({
                id: m.id, label: `${m.name}${m.team ? ' — ' + teamName(m.team) : ''}`,
              }))}
              onSelect={id => {
                const m = members.find(x => x.id === id);
                onUpdate?.({ ...node, assign: [...new Set([...(node.assign || []), id])], team: m?.team || node.team });
              }}
              placeholder="Pick person..."
            />
          </div>}

          {/* Quick estimate */}
          {!node.best && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>Estimate:</span>
            {[['S', 3, 1.3], ['M', 7, 1.4], ['L', 15, 1.5], ['XL', 30, 1.5], ['XXL', 45, 1.6]].map(([sz, d, fc]) =>
              <button key={sz} className="btn btn-sec btn-xs" style={{ padding: '1px 5px', fontSize: 9 }}
                onClick={() => onUpdate?.({ ...node, best: d, factor: fc })}>{sz}</button>)}
          </div>}

          {/* Concept phase button for exploratory items */}
          {item.conf === 'exploratory' && node.best > 0 && <button className="btn btn-sec btn-xs" style={{ fontSize: 9, padding: '1px 6px' }}
            title="Add a concept child task to clarify scope before implementation"
            onClick={() => {
              // Navigate to the node in tree view — user can add concept child from there
              onNavigate?.(item.id, 'tree');
            }}>+ Concept phase</button>}

          <button className="btn btn-ghost btn-xs" style={{ fontSize: 9, marginLeft: 'auto' }}
            onClick={() => onNavigate?.(item.id, 'gantt')}>Show in Gantt</button>
        </div>
      </div>;
    })}
  </div>;
}
