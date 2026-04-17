import { useState } from 'react';
import { useT, useTheme } from '../../i18n.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';

const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 … Sat=6, Sun=0

export function SettingsModal({ meta, taskTemplates, teams, onSave, onSaveTemplates, onClose }) {
  const { t, langPref, setLang } = useT();
  const { themePref, setTheme } = useTheme();
  const [m, setM] = useState({ ...meta });
  const sm = (k, v) => setM(x => ({ ...x, [k]: v }));
  const wd = m.workDays || [1, 2, 3, 4, 5]; // default Mon–Fri
  const dayLabels = t('set.dayNames').split(',');
  const toggleDay = (day) => {
    const next = wd.includes(day) ? wd.filter(d => d !== day) : [...wd, day].sort((a, b) => {
      const ai = DAY_NUMBERS.indexOf(a), bi = DAY_NUMBERS.indexOf(b);
      return ai - bi;
    });
    sm('workDays', next);
  };

  // ── Templates state ──
  const [tpls, setTpls] = useState(() => (taskTemplates || []).map(tp => ({ ...tp, phases: tp.phases.map(p => ({ ...p })) })));
  const [editId, setEditId] = useState(null);
  const editing = editId ? tpls.find(tp => tp.id === editId) : null;

  const addTemplate = () => {
    const tp = { id: 'tpl_' + Date.now(), name: t('ph.freePhase'), phases: [{ name: 'Phase 1', team: '' }] };
    setTpls([...tpls, tp]);
    setEditId(tp.id);
  };
  const deleteTemplate = (id) => {
    const tp = tpls.find(x => x.id === id);
    if (!confirm(t('ph.confirmDeleteTpl', tp?.name || id))) return;
    setTpls(tpls.filter(x => x.id !== id));
    if (editId === id) setEditId(null);
  };
  const updateTpl = (id, fn) => setTpls(tpls.map(tp => tp.id === id ? fn({ ...tp, phases: tp.phases.map(p => ({ ...p })) }) : tp));

  const saveAll = () => {
    onSave(m);
    onSaveTemplates(tpls);
    onClose();
  };

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>
      {/* ── Global settings (language + theme) ── */}
      <h2>{t('set.globalTitle')}</h2>
      <div className="frow">
        <div className="field"><label>{t('set.language')}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['auto', t('set.langAuto')], ['en', t('set.langEn')], ['de', t('set.langDe')]].map(([v, l]) =>
              <button key={v} className={`btn btn-xs ${langPref === v ? 'btn-pri' : 'btn-sec'}`} style={{ flex: 1 }}
                onClick={() => setLang(v)}>{l}</button>)}
          </div>
        </div>
        <div className="field"><label>{t('set.theme')}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['auto', t('set.themeAuto')], ['dark', t('set.themeDark')], ['light', t('set.themeLight')]].map(([v, l]) =>
              <button key={v} className={`btn btn-xs ${themePref === v ? 'btn-pri' : 'btn-sec'}`} style={{ flex: 1 }}
                onClick={() => setTheme(v)}>{l}</button>)}
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* ── Project settings ── */}
      <h2>{t('set.title')}</h2>
      <div className="field"><label>{t('set.projectName')}</label><input value={m.name || ''} onChange={e => sm('name', e.target.value)} /></div>
      <div className="frow">
        <div className="field"><label>{t('set.planStart')}</label><input type="date" value={m.planStart || ''} onChange={e => sm('planStart', e.target.value)} /></div>
        <div className="field"><label>{t('set.planEnd')}</label><input type="date" value={m.planEnd || ''} onChange={e => sm('planEnd', e.target.value)} /></div>
      </div>
      <div className="field">
        <label>{t('set.workDays')}</label>
        <div style={{ display: 'inline-flex', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--b2)' }}>
          {DAY_NUMBERS.map((day, i) => {
            const on = wd.includes(day);
            return <button key={day} onClick={() => toggleDay(day)}
              style={{ width: 44, padding: '7px 0', fontSize: 11, fontWeight: on ? 600 : 400, textAlign: 'center', cursor: 'pointer', border: 'none', borderRight: i < 6 ? '1px solid var(--b2)' : 'none', background: on ? 'var(--ac2)' : 'var(--bg3)', color: on ? '#fff' : 'var(--tx3)', transition: 'all .12s', fontFamily: 'var(--font)' }}>
              {dayLabels[i]}
            </button>;
          })}
        </div>
      </div>

      <hr className="divider" />

      {/* ── Task Templates ── */}
      <h2>{t('ph.templates')}</h2>

      {!editing && <>
        {tpls.map(tp => (
          <div key={tp.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>{tp.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-sec btn-xs" onClick={() => setEditId(tp.id)}>{t('ph.editTemplate')}</button>
                <button className="btn btn-danger btn-xs" onClick={() => deleteTemplate(tp.id)}>×</button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.5 }}>
              {tp.phases.map((p, i) => {
                const tn = p.team ? (teams || []).find(tm => tm.id === p.team)?.name || p.team : '';
                return <span key={i}>{i > 0 ? ' → ' : ''}{p.name}{tn ? ` (${tn})` : ''}</span>;
              })}
            </div>
          </div>
        ))}
        {tpls.length === 0 && <div style={{ color: 'var(--tx3)', fontSize: 11, padding: '12px 0', textAlign: 'center' }}>{t('ph.noPhases')}</div>}
        <button className="btn btn-sec btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={addTemplate}>{t('ph.newTemplate')}</button>
      </>}

      {editing && <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '12px' }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>{t('ph.templateName')}</label>
          <input value={editing.name} onChange={e => updateTpl(editing.id, tp => ({ ...tp, name: e.target.value }))} />
        </div>

        {editing.phases.map((ph, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--tx3)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input value={ph.name} placeholder={t('ph.phaseName')}
                onChange={e => updateTpl(editing.id, tp => { tp.phases[i] = { ...tp.phases[i], name: e.target.value }; return tp; })} />
            </div>
            <div className="field" style={{ width: 120, flexShrink: 0, marginBottom: 0 }}>
              <SearchSelect value={ph.team || ''} options={(teams || []).map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
                onSelect={v => updateTpl(editing.id, tp => { tp.phases[i] = { ...tp.phases[i], team: v }; return tp; })} allowEmpty placeholder={t('ph.phaseTeam')} />
            </div>
            <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} title={t('ph.moveUp')}
              disabled={i === 0}
              onClick={() => updateTpl(editing.id, tp => { const p = tp.phases.splice(i, 1)[0]; tp.phases.splice(i - 1, 0, p); return tp; })}>▲</button>
            <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} title={t('ph.moveDown')}
              disabled={i === editing.phases.length - 1}
              onClick={() => updateTpl(editing.id, tp => { const p = tp.phases.splice(i, 1)[0]; tp.phases.splice(i + 1, 0, p); return tp; })}>▼</button>
            <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }}
              disabled={editing.phases.length <= 1}
              onClick={() => updateTpl(editing.id, tp => { tp.phases.splice(i, 1); return tp; })}>×</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-sec btn-xs"
            onClick={() => updateTpl(editing.id, tp => { tp.phases.push({ name: '', team: '' }); return tp; })}>{t('ph.addPhase')}</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec btn-xs" onClick={() => setEditId(null)}>{t('back')}</button>
        </div>
      </div>}

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={saveAll}>{t('save')}</button>
      </div>
    </div>
  </div>;
}
