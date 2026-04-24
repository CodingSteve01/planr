import { useState } from 'react';
import { useT } from '../../i18n.jsx';

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

export function ExportModal({
  tab,
  onClose,
  onOpenJira,
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
  const { t: _t } = useT();
  const [todoH, setTodoH] = useState(30);
  const [sprintH, setSprintH] = useState(30);
  const [includeTimetable, setIncludeTimetable] = useState(true);
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
    <div className="overlay" onClick={onClose}>
      <div className="modal fade" style={{ width: 'min(940px, 100%)', maxWidth: 940 }} onClick={e => e.stopPropagation()}>
        <h2>Export</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 10,
          marginBottom: 4,
        }}>
          <Card cat="pdf" title="Management Summary"
            desc="Kennzahlen, Risiken, Subway-Map + optional Fahrplan, Critical Path, Team-Capacity."
            action={<>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--tx3)', cursor: 'pointer' }}
                data-htip="Chronologische Stations-Tabelle je Linie unter der Subway-Map">
                <input type="checkbox" checked={includeTimetable}
                  onChange={e => setIncludeTimetable(e.target.checked)} />
                +Fahrplan
              </label>
              {B('sum', 'PDF', () => onSummaryPDF({ includeTimetable }))}
            </>} />

          <Card cat="pdf" title="Gantt / Zeitplan"
            desc="Hochauflösendes Timeline-Bild + vollständige Terminübersicht je Team."
            action={B('gantt', 'PDF', onGanttPDF)} />

          <Card cat="pdf" title="Was kommt wann"
            desc="Horizontgerecht: exakte Daten kurzfristig, Wochen/Monate/Quartale weiter weg."
            action={B('ww', 'PDF', onWhatWhenPDF)} />

          <Card cat="pdf" title="TODO / Sprint"
            desc="Nahfristige Aufgaben je Person, mit Planungssicherheit-Badges."
            action={<>{H(todoH, setTodoH)}{B('todo', 'PDF', () => onTodoPDF(todoH))}</>} />

          <Card cat="word" title="Projektbericht"
            desc="Full-Report inkl. Roadmap, Team-Capacity, Detailplan je Team. Für Confluence-Import."
            action={B('docx', 'DOCX', onReportDocx)} />

          <Card cat="tool" title="Jira-Export"
            desc="Konfigurierbarer CSV-Export mit Epic/Story/Task-Mapping."
            action={<button className="btn btn-pri btn-sm" onClick={() => { onClose(); onOpenJira(); }}>Dialog</button>} />

          <Card cat="tool" title="Sprint (Markdown)"
            desc="TODO-Liste als Markdown – für Issue-Tracker oder Docs."
            action={<>{H(sprintH, setSprintH)}{B('sprint', 'MD', () => onSprintMarkdown(sprintH))}</>} />

          <Card cat="tool" title="Mermaid-Graph"
            desc="Struktur-Graph als Mermaid-Flowchart. Paste in Confluence."
            action={B('mermaid', 'MD', onMermaid)} />

          <Card cat="img" title="Netzwerk-Bild"
            desc={tab === 'net' ? 'Aktuelle Netzwerkgrafik als PNG.' : 'Nur vom Netzwerk-Tab aus verfügbar.'}
            action={B('nN', 'PNG', onNetworkPNG, { disabled: tab !== 'net' })}
            disabled={tab !== 'net'} />

          <Card cat="img" title="Gantt-Bild"
            desc={tab === 'gantt' ? 'Aktuelle Gantt-Grafik als PNG.' : 'Nur vom Gantt-Tab aus verfügbar.'}
            action={B('nG', 'PNG', onGanttPNG, { disabled: tab !== 'gantt' })}
            disabled={tab !== 'gantt'} />

          <Card cat="raw" title="Backup"
            desc="Vollständiges Projekt-JSON – reimportierbar, 1:1-Round-Trip."
            action={B('json', 'JSON', onJSON)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>{_t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}
