// The screen shown when no plan is loaded: the onboarding card plus the two
// ways to start a plan from nothing (the wizard, a Jira paste). `session` holds
// what starting a plan has to reset: the document setter, the history reset
// and the saved flag.
import { Onboard } from '../views/Onboard.jsx';
import { NewProjModal } from '../modals/NewProjModal.jsx';
import { JiraImportModal } from '../modals/JiraImportModal.jsx';
import { buildImportedProject } from '../../utils/jiraImport.js';
import { TOUR_DONE_KEY } from '../../app/useTour.js';

export function EmptyState({ t, modal, setModal, fRef, onLoadFile, onFileInput, session, setTab, setSel, setTourStep }) {
  const { setData, resetHistory, setSaved } = session;
  return (
    <>
      <Onboard
        onCreate={() => setModal('new')}
        onLoad={onLoadFile}
        fRef={fRef}
        onJiraImport={() => setModal('jiraImport')}
        onLoadDemo={() => {
          import('../../utils/demoProject.js').then(m => {
            const demo = m.buildDemoProject(t);
            setData(demo);
            resetHistory();
            setSaved(false);
            setTab('summary');
            setSel(demo.tree?.[0] || null);
          });
        }}
      />
      {modal === 'new' && (
        <NewProjModal
          onClose={() => setModal(null)}
          onCreate={d => {
            setData(d);
            resetHistory();
            setSaved(false);
            setModal(null);
            setTab('tree');
            setSel(d.tree?.[0] || null);
            // Auto-start tour for first-time users (tour not yet dismissed)
            try {
              if (!localStorage.getItem(TOUR_DONE_KEY)) setTourStep(0);
            } catch {}
          }}
        />
      )}
      {/* The other way to start: the work is already in Jira. Same shell the
        wizard builds — standard template, NRW holidays, two teams — with the
        tree coming from the paste instead of from an empty form. */}
      {modal === 'jiraImport' && (
        <JiraImportModal
          onClose={() => setModal(null)}
          onImport={({ nodes, newMembers, projectName }) => {
            const d = buildImportedProject({ nodes, members: newMembers, name: projectName, t });
            setData(d);
            resetHistory();
            setSaved(false);
            setModal(null);
            setTab('tree');
            setSel(d.tree?.[0] || null);
          }}
        />
      )}
      <input ref={fRef} type="file" accept=".json,.md" style={{ display: 'none' }} onChange={onFileInput} />
    </>
  );
}
