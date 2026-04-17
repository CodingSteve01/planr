import { useState } from 'react';
import { useT, useTheme } from '../../i18n.jsx';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { createPhaseDraft, normalizePhases, phaseTeamIds, phaseTeamLabel } from '../../utils/phases.js';
import { PhaseList } from '../shared/Phases.jsx';

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
  const [tpls, setTpls] = useState(() => (taskTemplates || []).map(tp => ({ ...tp, phases: normalizePhases(tp.phases) })));
  const [editId, setEditId] = useState(null);
  const editing = editId ? tpls.find(tp => tp.id === editId) : null;

  const addTemplate = () => {
    const tp = { id: 'tpl_' + Date.now(), name: t('ph.freePhase'), phases: [createPhaseDraft({ name: 'Phase 1' })] };
    setTpls([...tpls, tp]);
    setEditId(tp.id);
  };
  const deleteTemplate = (id) => {
    const tp = tpls.find(x => x.id === id);
    if (!confirm(t('ph.confirmDeleteTpl', tp?.name || id))) return;
    setTpls(tpls.filter(x => x.id !== id));
    if (editId === id) setEditId(null);
  };
  const updateTpl = (id, fn) => setTpls(tpls.map(tp => tp.id === id ? fn({ ...tp, phases: normalizePhases(tp.phases) }) : tp));

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
                const tn = phaseTeamLabel(p, teams);
                return <span key={i}>{i > 0 ? ' → ' : ''}{p.name}{p.effortPct ? ` ${p.effortPct}%` : ''}{tn ? ` (${tn})` : ''}</span>;
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

        <PhaseList
          phases={editing.phases}
          templates={[]}
          teams={teams}
          members={[]}
          showStatus={false}
          onChange={(nextPhases) => updateTpl(editing.id, tp => ({ ...tp, phases: nextPhases }))}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sec btn-xs" onClick={() => setEditId(null)}>{t('back')}</button>
        </div>
        <p className="helper">{t('ph.templateHelp')}</p>
      </div>}

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={saveAll}>{t('save')}</button>
      </div>
    </div>
  </div>;
}
