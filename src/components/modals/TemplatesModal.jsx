import { useState } from 'react';
import { SearchSelect } from '../shared/SearchSelect.jsx';
import { useT } from '../../i18n.jsx';

export function TemplatesModal({ templates, teams, onSave, onClose }) {
  const { t } = useT();
  const [list, setList] = useState(() => (templates || []).map(tp => ({ ...tp, phases: tp.phases.map(p => ({ ...p })) })));
  const [editId, setEditId] = useState(null);

  const save = () => { onSave(list); onClose(); };

  const addTemplate = () => {
    const tp = { id: 'tpl_' + Date.now(), name: t('ph.freePhase'), phases: [{ name: 'Phase 1', team: '' }] };
    setList([...list, tp]);
    setEditId(tp.id);
  };

  const deleteTemplate = (id) => {
    const tp = list.find(x => x.id === id);
    if (!confirm(t('ph.confirmDeleteTpl', tp?.name || id))) return;
    setList(list.filter(x => x.id !== id));
    if (editId === id) setEditId(null);
  };

  const updateTpl = (id, fn) => setList(list.map(tp => tp.id === id ? fn({ ...tp, phases: tp.phases.map(p => ({ ...p })) }) : tp));

  const editing = editId ? list.find(tp => tp.id === editId) : null;

  return <div className="overlay" onClick={onClose}>
    <div className="modal fade" style={{ maxWidth: 540, width: '95vw' }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t('ph.templates')}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>×</button>
      </div>
      <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

        {/* ── Template list ── */}
        {!editing && <>
          {list.map(tp => (
            <div key={tp.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{tp.name}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sec btn-xs" onClick={() => setEditId(tp.id)}>{t('ph.editTemplate')}</button>
                  <button className="btn btn-danger btn-xs" onClick={() => deleteTemplate(tp.id)}>×</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6 }}>
                {tp.phases.map((p, i) => {
                  const tn = p.team ? teams.find(tm => tm.id === p.team)?.name || p.team : '';
                  return <span key={i}>{i > 0 ? ' → ' : ''}{p.name}{tn ? ` (${tn})` : ''}</span>;
                })}
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ color: 'var(--tx3)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>{t('ph.noPhases')}</div>}
          <button className="btn btn-sec" style={{ width: '100%', marginTop: 4 }} onClick={addTemplate}>{t('ph.newTemplate')}</button>
        </>}

        {/* ── Editing a template ── */}
        {editing && <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('ph.templateName')}</label>
            <input value={editing.name} onChange={e => updateTpl(editing.id, tp => ({ ...tp, name: e.target.value }))} />
          </div>

          {editing.phases.map((ph, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <input style={{ flex: 1 }} value={ph.name} placeholder={t('ph.phaseName')}
                onChange={e => updateTpl(editing.id, tp => { tp.phases[i] = { ...tp.phases[i], name: e.target.value }; return tp; })} />
              <div style={{ width: 120, flexShrink: 0 }}>
                <SearchSelect value={ph.team || ''} options={teams.map(tm => ({ id: tm.id, label: tm.name || tm.id }))}
                  onSelect={v => updateTpl(editing.id, tp => { tp.phases[i] = { ...tp.phases[i], team: v }; return tp; })} allowEmpty placeholder={t('ph.phaseTeam')} />
              </div>
              <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} data-htip={t('ph.moveUp')}
                disabled={i === 0}
                onClick={() => updateTpl(editing.id, tp => { const p = tp.phases.splice(i, 1)[0]; tp.phases.splice(i - 1, 0, p); return tp; })}>▲</button>
              <button className="btn btn-sec btn-xs" style={{ padding: '2px 5px' }} data-htip={t('ph.moveDown')}
                disabled={i === editing.phases.length - 1}
                onClick={() => updateTpl(editing.id, tp => { const p = tp.phases.splice(i, 1)[0]; tp.phases.splice(i + 1, 0, p); return tp; })}>▼</button>
              <button className="btn btn-danger btn-xs" style={{ padding: '2px 5px' }}
                disabled={editing.phases.length <= 1}
                onClick={() => updateTpl(editing.id, tp => { tp.phases.splice(i, 1); return tp; })}>×</button>
            </div>
          ))}

          <button className="btn btn-sec btn-sm" style={{ marginTop: 4 }}
            onClick={() => updateTpl(editing.id, tp => { tp.phases.push({ name: '', team: '' }); return tp; })}>{t('ph.addPhase')}</button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 16 }}>
            <button className="btn btn-sec" onClick={() => setEditId(null)}>{t('back')}</button>
          </div>
        </>}
      </div>
      <div className="modal-footer">
        <div style={{ flex: 1 }} />
        <button className="btn btn-sec" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-pri" onClick={save}>{t('save')}</button>
      </div>
    </div>
  </div>;
}
