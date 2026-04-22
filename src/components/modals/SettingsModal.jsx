import { useState } from 'react';
import { useT, useTheme } from '../../i18n.jsx';
import { createPhaseDraft, normalizePhases, phaseTeamLabel } from '../../utils/phases.js';
import { PhaseList } from '../shared/Phases.jsx';
import { DEFAULT_RISKS, resolveRiskName } from '../../utils/risks.js';
import { DEFAULT_SIZES } from '../../utils/sizes.js';
import { DEFAULT_CUSTOM_FIELDS } from '../../utils/customFields.js';
import { SearchSelect } from '../shared/SearchSelect.jsx';

const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0];

export function SettingsModal({ meta, taskTemplates, risks: projectRisks, sizes: projectSizes, customFields: projectCustomFields, teams, onSave, onSaveTemplates, onSaveRisks, onSaveSizes, onSaveCustomFields, onClose }) {
  const { t, langPref, setLang } = useT();
  const { themePref, setTheme } = useTheme();
  const [tab, setTab] = useState('general');
  const [m, setM] = useState({ ...meta });
  const sm = (k, v) => setM(x => ({ ...x, [k]: v }));
  const wd = m.workDays || [1, 2, 3, 4, 5];
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

  // ── Risks state ──
  const [riskList, setRiskList] = useState(() => projectRisks?.length ? [...projectRisks] : [...DEFAULT_RISKS]);
  const updateRisk = (i, patch) => setRiskList(riskList.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRisk = () => setRiskList([...riskList, { id: 'risk_' + Date.now(), name: '', weight: 0.1 }]);
  const removeRisk = (i) => setRiskList(riskList.filter((_, j) => j !== i));
  const resetDefaults = () => { if (confirm(t('set.confirmResetRisks'))) setRiskList([...DEFAULT_RISKS]); };

  // ── Sizes state ──
  const [sizeList, setSizeList] = useState(() => projectSizes?.length ? [...projectSizes] : [...DEFAULT_SIZES]);
  const updateSize = (i, patch) => setSizeList(sizeList.map((s, j) => j === i ? { ...s, ...patch } : s));
  const addSize = () => setSizeList([...sizeList, { label: '', days: 1, factor: 1.5 }]);
  const removeSize = (i) => setSizeList(sizeList.filter((_, j) => j !== i));
  const resetSizeDefaults = () => { if (confirm(t('set.confirmResetSizes'))) setSizeList([...DEFAULT_SIZES]); };

  // ── Custom fields state ──
  const [cfList, setCfList] = useState(() => projectCustomFields?.length ? [...projectCustomFields] : [...DEFAULT_CUSTOM_FIELDS]);
  const updateCf = (i, patch) => setCfList(cfList.map((f, j) => j === i ? { ...f, ...patch } : f));
  const addCf = () => setCfList([...cfList, { id: 'cf_' + Date.now(), name: '', type: 'text' }]);
  const removeCf = (i) => { if (confirm(t('cf.removeField') + '?')) setCfList(cfList.filter((_, j) => j !== i)); };

  const CF_TYPES = [
    { id: 'text', label: t('cf.type.text') },
    { id: 'number', label: t('cf.type.number') },
    { id: 'uri', label: t('cf.type.uri') },
    { id: 'select', label: t('cf.type.select') },
  ];

  const saveAll = () => {
    onSave(m);
    onSaveTemplates(tpls);
    onSaveRisks?.(riskList);
    onSaveSizes?.(sizeList);
    onSaveCustomFields?.(cfList);
    onClose();
  };

  const TABS = [
    { id: 'general', label: t('set.title') },
    { id: 'templates', label: t('ph.templates') },
    { id: 'customfields', label: t('cf.tab') },
    { id: 'sizes', label: t('set.sizes') },
    { id: 'risks', label: t('set.risks') },
  ];

  return <div className="overlay">
    <div className="modal modal-lg fade" onClick={e => e.stopPropagation()}>

      {/* ── Tab bar ── */}
      <div className="qe-tabs" style={{ margin: '0 -22px 14px', padding: '0 22px' }}>
        {TABS.map(x => <button key={x.id} className={`qe-tab${tab === x.id ? ' active' : ''}`} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>

      {/* ══════ GENERAL TAB ══════ */}
      {tab === 'general' && <>
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
      </>}

      {/* ══════ TEMPLATES TAB ══════ */}
      {tab === 'templates' && <>
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
      </>}

      {/* ══════ SIZES TAB ══════ */}
      {tab === 'sizes' && <>
        <h2>{t('set.sizeCatalogue')}</h2>
        <p className="helper" style={{ marginBottom: 12 }}>{t('set.sizeHelp')}</p>

        <div style={{ display: 'flex', gap: 4, marginBottom: 6, fontSize: 10, fontWeight: 600, color: 'var(--tx3)', textTransform: 'uppercase', paddingRight: 28 }}>
          <span style={{ flex: '0 0 64px' }}>{t('set.sizeLabel')}</span>
          <span style={{ width: 80, flexShrink: 0, textAlign: 'right' }}>{t('set.sizeDays')}</span>
          <span style={{ width: 72, flexShrink: 0, textAlign: 'right' }}>{t('set.sizeFactor')}</span>
          <span style={{ flex: 1 }}>{t('set.sizeDesc')}</span>
        </div>

        {sizeList.map((sz, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <div className="field" style={{ flex: '0 0 64px', marginBottom: 0 }}>
              <input value={sz.label} placeholder={t('set.sizeLabelPlaceholder')}
                onChange={e => updateSize(i, { label: e.target.value })} />
            </div>
            <div className="field" style={{ width: 80, flexShrink: 0, marginBottom: 0 }}>
              <input type="number" min="1" step="1" value={sz.days} placeholder="d"
                onChange={e => updateSize(i, { days: +e.target.value || 1 })}
                style={{ textAlign: 'right' }} />
            </div>
            <div className="field" style={{ width: 72, flexShrink: 0, marginBottom: 0 }}>
              <input type="number" step="0.1" min="1" max="5" value={sz.factor} placeholder="×"
                onChange={e => updateSize(i, { factor: +e.target.value || 1.5 })}
                style={{ textAlign: 'right' }} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input value={sz.desc || ''} placeholder={t('set.sizeDesc')}
                onChange={e => updateSize(i, { desc: e.target.value })} />
            </div>
            <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }} onClick={() => removeSize(i)}>×</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-sec btn-xs" onClick={addSize}>{t('set.addSize')}</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: 'var(--tx3)' }} onClick={resetSizeDefaults}>{t('set.resetSizes')}</button>
        </div>
      </>}

      {/* ══════ CUSTOM FIELDS TAB ══════ */}
      {tab === 'customfields' && <>
        <h2>{t('cf.tab')}</h2>
        <p className="helper" style={{ marginBottom: 12 }}>{t('cf.help')}</p>

        {cfList.map((cf, i) => (
          <div key={cf.id || i} style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                <label style={{ fontSize: 10 }}>{t('cf.name')}</label>
                <input value={cf.name} placeholder="e.g. Jira ID" onChange={e => updateCf(i, { name: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '0 0 120px', marginBottom: 0 }}>
                <label style={{ fontSize: 10 }}>{t('cf.type')}</label>
                <SearchSelect value={cf.type} options={CF_TYPES} onSelect={id => updateCf(i, { type: id })} />
              </div>
              <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px', marginBottom: 1 }} onClick={() => removeCf(i)}>×</button>
            </div>
            {cf.type === 'uri' && <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <label style={{ fontSize: 10 }}>{t('cf.template')}</label>
              <input value={cf.uriTemplate || ''} placeholder="https://company.atlassian.net/browse/{value}"
                onChange={e => updateCf(i, { uriTemplate: e.target.value })} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
            </div>}
            {cf.type === 'select' && <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
              <label style={{ fontSize: 10 }}>{t('cf.options')}</label>
              <input value={(cf.options || []).join(', ')} placeholder="Option A, Option B, Option C"
                onChange={e => updateCf(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>}
          </div>
        ))}

        {cfList.length === 0 && <div style={{ color: 'var(--tx3)', fontSize: 11, padding: '12px 0', textAlign: 'center' }}>No custom fields yet.</div>}
        <button className="btn btn-sec btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={addCf}>{t('cf.addField')}</button>
      </>}

      {/* ══════ RISKS TAB ══════ */}
      {tab === 'risks' && <>
        <h2>{t('set.riskCatalogue')}</h2>
        <p className="helper" style={{ marginBottom: 12 }}>{t('set.riskHelp')}</p>

        {riskList.map((risk, i) => (
          <div key={risk.id || i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input value={risk.i18nKey ? resolveRiskName(risk, t) : (risk.name || '')} placeholder={t('set.riskName')}
                onChange={e => updateRisk(i, { name: e.target.value, i18nKey: undefined })} />
            </div>
            <div className="field" style={{ width: 80, flexShrink: 0, marginBottom: 0 }}>
              <input type="number" step="0.05" min="0.05" max="1" value={risk.weight} placeholder="Gewicht"
                onChange={e => updateRisk(i, { weight: +e.target.value || 0.1 })}
                style={{ textAlign: 'right' }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--tx3)', fontFamily: 'var(--mono)', flexShrink: 0, width: 32, textAlign: 'right' }}>+{Math.round(risk.weight * 100)}%</span>
            <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }} onClick={() => removeRisk(i)}>×</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-sec btn-xs" onClick={addRisk}>{t('set.addRisk')}</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-xs" style={{ fontSize: 10, color: 'var(--tx3)' }} onClick={resetDefaults}>{t('set.resetRisks')}</button>
        </div>
      </>}

      <div className="modal-footer">
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={saveAll}>{t('save')}</button>
      </div>
    </div>
  </div>;
}
