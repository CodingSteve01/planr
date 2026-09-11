import { useState } from 'react';
import { useT } from '../../i18n.jsx';

// The export card grid — used by ExportModal.jsx (Export… (dialog), still
// reachable from the `/` palette) AND by ReportView.jsx (Report mode's
// primary surface, phase 3 of the rebuild). Lifted out of ExportModal so
// neither place duplicates the handler/state logic (docs/principles.md,
// "How we read proposals" — nothing about export capability changes here,
// only where it is reached from).
const CAT_COLORS = {
  pdf: 'var(--ac)',      // blue
  word: '#6366f1',       // indigo
  tool: 'var(--tx3)',    // gray
  img: '#14b8a6',        // teal
  raw: '#64748b',        // slate
};
const CAT_LABEL = {
  pdf: 'PDF',
  word: 'Word',
  tool: 'Tool',
  img: 'Bild',
  raw: 'Daten',
};

function Card({ cat, title, desc, action, disabled }) {
  const color = CAT_COLORS[cat];
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--b)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--r)',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      opacity: disabled ? 0.45 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
          color, padding: '1px 5px', border: `1px solid ${color}`, borderRadius: 3, flexShrink: 0,
        }}>{CAT_LABEL[cat]}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--tx3)', lineHeight: 1.35, flex: 1, minHeight: 28 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>{action}</div>
    </div>
  );
}

export function ExportCards({
  tab,
  onOpenJira,
  onOpenJiraSync,
  onSummaryPDF,
  onGanttPDF,
  onWhatWhenPDF,
  onTodoPDF,
  onReportDocx,
  onSprintMarkdown,
  onMermaid,
  onNetworkPNG,
  onGanttPNG,
  onJSON,
}) {
  const { t } = useT();
  const [todoH, setTodoH] = useState(30);
  const [sprintH, setSprintH] = useState(30);
  const [includeTimetable, setIncludeTimetable] = useState(true);
  const [includeProjectRoadmaps, setIncludeProjectRoadmaps] = useState(true);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({});  // key → ts of last success

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      setDone(d => ({ ...d, [key]: Date.now() }));
      setTimeout(() => setDone(d => { const n = { ...d }; delete n[key]; return n; }), 2000);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + (e?.message || e));
    } finally {
      setBusy(null);
    }
  };
  const B = (k, label, handler, extra = {}) => (
    <button
      className={`btn btn-sm ${done[k] ? 'btn-sec' : 'btn-pri'}`}
      disabled={busy === k || extra.disabled}
      onClick={() => run(k, handler)}
    >
      {busy === k ? '…' : done[k] ? '✓' : label}
    </button>
  );
  const H = (val, setVal) => (
    <select className="btn btn-sec btn-sm" style={{ padding: '3px 6px', width: 58 }} value={val} onChange={e => setVal(parseInt(e.target.value))}>
      {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d}d</option>)}
    </select>
  );

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 10,
      marginBottom: 4,
    }}>
      <Card cat="pdf" title={t('ex.summary')}
        desc={t('ex.summary.desc')}
        action={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }}
            data-htip={t('tt.plusTimetableTip')}>
            <input type="checkbox" checked={includeTimetable}
              onChange={e => setIncludeTimetable(e.target.checked)} />
            {t('tt.plusTimetable')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }}
            data-htip={t('rm.plusProjectRoadmapsTip')}>
            <input type="checkbox" checked={includeProjectRoadmaps}
              onChange={e => setIncludeProjectRoadmaps(e.target.checked)} />
            {t('rm.plusProjectRoadmaps')}
          </label>
          {B('sum', 'PDF', () => onSummaryPDF({ includeTimetable, includeProjectRoadmaps }))}
        </div>} />

      <Card cat="pdf" title={t('ex.gantt')}
        desc={t('ex.gantt.desc')}
        action={B('gantt', 'PDF', onGanttPDF)} />

      <Card cat="pdf" title={t('ex.whatwhen')}
        desc={t('ex.whatwhen.desc')}
        action={B('ww', 'PDF', onWhatWhenPDF)} />

      <Card cat="pdf" title={t('ex.todo')}
        desc={t('ex.todo.desc')}
        action={<>{H(todoH, setTodoH)}{B('todo', 'PDF', () => onTodoPDF(todoH))}</>} />

      <Card cat="word" title={t('ex.docx')}
        desc={t('ex.docx.desc')}
        action={B('docx', 'DOCX', onReportDocx)} />

      <Card cat="tool" title={t('ex.jira')}
        desc={t('ex.jira.desc')}
        action={<button className="btn btn-pri btn-sm" onClick={onOpenJira}>{t('ex.dialog')}</button>} />

      <Card cat="tool" title={t('ex.jiraSync')}
        desc={t('ex.jiraSync.desc')}
        action={<button className="btn btn-pri btn-sm" onClick={onOpenJiraSync}>{t('ex.dialog')}</button>} />

      <Card cat="tool" title={t('ex.sprint')}
        desc={t('ex.sprint.desc')}
        action={<>{H(sprintH, setSprintH)}{B('sprint', 'MD', () => onSprintMarkdown(sprintH))}</>} />

      <Card cat="tool" title={t('ex.mermaid')}
        desc={t('ex.mermaid.desc')}
        action={B('mermaid', 'MD', onMermaid)} />

      <Card cat="img" title={t('ex.netPng')}
        desc={tab === 'net' ? t('ex.netPng.desc') : t('ex.netPng.off')}
        action={B('nN', 'PNG', onNetworkPNG, { disabled: tab !== 'net' })}
        disabled={tab !== 'net'} />

      <Card cat="img" title={t('ex.ganttPng')}
        desc={tab === 'gantt' ? t('ex.ganttPng.desc') : t('ex.ganttPng.off')}
        action={B('nG', 'PNG', onGanttPNG, { disabled: tab !== 'gantt' })}
        disabled={tab !== 'gantt'} />

      <Card cat="raw" title={t('ex.backup')}
        desc={t('ex.backup.desc')}
        action={B('json', 'JSON', onJSON)} />
    </div>
  );
}
