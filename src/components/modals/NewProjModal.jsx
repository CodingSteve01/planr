import { useState } from 'react';
import { iso } from '../../utils/date.js';
import { computeNRW } from '../../utils/holidays.js';
import { GT, GL } from '../../constants.js';
import { useT } from '../../i18n.jsx';
import { PROJECT_TEMPLATES, DEFAULT_TEMPLATE_ID } from '../../utils/projectTemplates.js';

export function NewProjModal({ onCreate, onClose }) {
  const { t } = useT();
  const today = iso(new Date()), twoY = iso(new Date(new Date().getFullYear() + 2, 11, 31));
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [f, setF] = useState({ name: '', planStart: today, planEnd: twoY, holidays: 'NRW' });
  const [ts, setTs] = useState([{ id: 'T1', name: 'Frontend', color: '#3b82f6' }, { id: 'T2', name: 'Backend', color: '#f43f5e' }]);
  const [goals, setGoals] = useState([]);
  const sf = (k, v) => setF(x => ({ ...x, [k]: v }));
  const upT = (i, k, v) => setTs(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const upG = (i, k, v) => setGoals(gs => gs.map((g, j) => j === i ? { ...g, [k]: v } : g));
  const addG = (type) => setGoals(gs => [...gs, { id: 'g' + Date.now() + gs.length, name: '', type, date: '', severity: 'high', description: '', linkedItems: [] }]);
  const toPrio = severity => severity === 'critical' ? 1 : severity === 'high' ? 2 : 3;

  function doCreate() {
    if (!f.name) return;
    const nowY = new Date().getFullYear(); const planYears = []; for (let y = Math.min(nowY - 1, new Date(f.planStart).getFullYear()); y <= Math.max(nowY + 2, new Date(f.planEnd).getFullYear()); y++) planYears.push(y);
    const hols = f.holidays === 'NRW' ? computeNRW(planYears) : [];
    const cleanGoals = goals.map(g => ({ ...g, name: (g.name || '').trim(), description: (g.description || '').trim() })).filter(g => g.name);
    const tree = cleanGoals.map((g, i) => ({
      id: `P${i + 1}`,
      name: g.name,
      status: 'open',
      team: '',
      best: 0,
      factor: 1.5,
      prio: toPrio(g.severity),
      seq: (i + 1) * 10,
      deps: [],
      note: '',
      assign: [],
      // Goal metadata directly on the tree root
      type: g.type,
      severity: g.severity || 'high',
      date: g.date || '',
      description: g.description || '',
    }));

    // Seed risks, sizes, and task templates from the selected project template
    const tpl = PROJECT_TEMPLATES.find(p => p.id === templateId) ?? PROJECT_TEMPLATES.find(p => p.id === DEFAULT_TEMPLATE_ID);
    onCreate({
      meta: { ...f, version: '2' },
      teams: ts,
      members: [],
      vacations: [],
      tree,
      holidays: hols,
      risks: tpl ? [...tpl.risks] : undefined,
      sizes: tpl ? [...tpl.sizes] : undefined,
      taskTemplates: tpl ? tpl.taskTemplates.map(tt => ({ ...tt, phases: tt.phases.map(ph => ({ ...ph })) })) : undefined,
    });
  }

  return <div className="overlay">
    <div className="modal modal-lg fade">
      <h2>{t('np.title')} {step === 2 && <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 400 }}>{t('np.titleFocus')}</span>}</h2>

      {step === 1 && <>
        {/* ── Template picker ── */}
        <div className="field" style={{ marginBottom: 14 }}>
          <label>{t('np.template')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, marginTop: 4 }}>
            {PROJECT_TEMPLATES.map(tpl => (
              <button key={tpl.id} type="button"
                onClick={() => setTemplateId(tpl.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                  padding: '8px 10px', borderRadius: 'var(--r)', cursor: 'pointer', textAlign: 'left',
                  background: templateId === tpl.id ? 'var(--ac2)22' : 'var(--bg3)',
                  border: `1px solid ${templateId === tpl.id ? 'var(--ac)' : 'var(--b2)'}`,
                  color: 'var(--tx)', fontFamily: 'var(--font)',
                }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{tpl.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t(tpl.nameKey)}</span>
                <span style={{ fontSize: 10, color: 'var(--tx3)', lineHeight: 1.4 }}>{t(tpl.descKey)}</span>
              </button>
            ))}
          </div>
          <p className="helper" style={{ marginTop: 6 }}>{t('np.templateHelp')}</p>
        </div>

        <hr className="divider" />

        <div className="field"><label>{t('np.projectName')}</label>
          <input value={f.name} onChange={e => sf('name', e.target.value)} placeholder={t('np.projectNamePlaceholder')} autoFocus />
        </div>
        <div className="frow">
          <div className="field"><label>{t('np.planStart')}</label><input type="date" value={f.planStart} onChange={e => sf('planStart', e.target.value)} /></div>
          <div className="field"><label>{t('np.planEnd')}</label><input type="date" value={f.planEnd} onChange={e => sf('planEnd', e.target.value)} /></div>
          <div className="field"><label>{t('np.holidays')}</label>
            <select value={f.holidays} onChange={e => sf('holidays', e.target.value)}>
              <option value="NRW">Germany — NRW</option><option value="none">None</option>
            </select>
          </div>
        </div>
        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--tx3)' }}>{t('np.teams')}</div>
          <button className="btn btn-sec btn-sm" onClick={() => setTs(ts => [...ts, { id: `T${ts.length + 1}`, name: '', color: '#a78bfa' }])}>{t('np.addTeam')}</button>
        </div>
        {ts.map((tm, i) => <div key={i} className="frow" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
          <div className="field" style={{ flex: '0 0 70px' }}><label>{t('np.teamId')}</label><input value={tm.id} onChange={e => upT(i, 'id', e.target.value)} /></div>
          <div className="field"><label>{t('np.teamName')}</label><input value={tm.name} onChange={e => upT(i, 'name', e.target.value)} placeholder={t('np.teamNamePlaceholder')} /></div>
          <div className="field" style={{ flex: '0 0 55px' }}><label>{t('np.teamColor')}</label><input type="color" value={tm.color} onChange={e => upT(i, 'color', e.target.value)} /></div>
          <div style={{ marginBottom: 12 }}><button className="btn btn-danger btn-sm" onClick={() => setTs(ts => ts.filter((_, j) => j !== i))}>{t('np.removeTeam')}</button></div>
        </div>)}
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-pri" disabled={!f.name} onClick={() => setStep(2)}>{t('np.nextFocus')}</button>
        </div>
      </>}

      {step === 2 && <>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 12 }}>{t('np.focusLead')}</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {Object.keys(GT).map(tp => <button key={tp} className="goal-type-btn" onClick={() => addG(tp)}>{GT[tp]} {t('np.addGoal', GL[tp])}</button>)}
        </div>
        {goals.map((g, i) => <div key={g.id} style={{ background: 'var(--bg3)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', padding: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{GT[g.type]}</span>
            <input style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx)', fontSize: 12, padding: '5px 8px', outline: 'none' }} placeholder={GL[g.type] + ' name'} value={g.name} onChange={e => upG(i, 'name', e.target.value)} />
            {g.type === 'deadline' && <input type="date" style={{ width: 130, background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx)', fontSize: 11, padding: '5px 6px', outline: 'none' }} value={g.date || ''} onChange={e => upG(i, 'date', e.target.value)} />}
            <button className="btn btn-danger btn-xs" onClick={() => setGoals(gs => gs.filter((_, j) => j !== i))}>{t('rv.remove')}</button>
          </div>
          <input style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--b2)', borderRadius: 'var(--r)', color: 'var(--tx2)', fontSize: 11, padding: '4px 8px', outline: 'none' }} placeholder={t('np.descPlaceholder')} value={g.description || ''} onChange={e => upG(i, 'description', e.target.value)} />
        </div>)}
        {!goals.length && <div style={{ textAlign: 'center', padding: 24, color: 'var(--tx3)', fontSize: 11 }}>{t('np.noFocus')}</div>}
        <div className="modal-footer">
          <button className="btn btn-sec" onClick={() => setStep(1)}>{t('np.backStep')}</button>
          <button className="btn btn-pri" onClick={doCreate}>{t('np.createProject')}</button>
        </div>
      </>}
    </div>
  </div>;
}
