import { PersonChip } from '../../shared/PersonChip.jsx';
import { useT } from '../../../i18n.jsx';
import { Icon } from '../../shared/Icon.jsx';

// Who will do the row — the schedule's answer or the hand-assigned person.
export function QueueDoerChip({ doer }) {
  const { t } = useT();
  if (!doer) return null;
  // Same chip as the tree, the Gantt and the Planning tab.
  // This view invented the `~name` vocabulary that all of
  // them now share; it may as well use the component.
  return (
    <span data-queue-who data-auto={doer.auto ? 'true' : undefined}>
      <PersonChip auto={doer.auto} short={doer.name} title={doer.auto ? t('wo.autoWho') : t('wo.fixedWho')} />
    </span>
  );
}

// Where the row lives: its project and package, with the change from the row
// above carried by weight and colour.
export function QueuePath({ id, prevId, pathOf }) {
  const chain = pathOf(id);
  const project = chain[0] || '';
  const parent = chain.length > 1 ? chain[chain.length - 1] : '';
  // …and only where it CHANGES. Forty rows from one package
  // printed the same two names forty times and the task
  // names drowned in them. Saying it once and then only when
  // it moves makes the crossings visible, which is the thing
  // this list is for: you can see where one project's work
  // gives way to another's.
  const prevChain = prevId ? pathOf(prevId) : [];
  const sameProject = project && prevChain[0] === project;
  const sameParent = sameProject && parent && (prevChain.length > 1 ? prevChain[prevChain.length - 1] : '') === parent;
  // Always both, and the CHANGE is what stands out. Printing
  // them only where they changed made the list quiet but
  // left most rows without a parent at all — reported as
  // "I don't always see the parents". A row read on its
  // own has to say where it lives; the crossings from one
  // project or package to the next are carried by weight
  // and colour instead of by absence.
  const mark = changed => (changed ? { color: 'var(--tx2)', fontWeight: 600 } : undefined);
  return (
    <div
      data-queue-path
      data-htip={[id, ...chain].join(' › ')}
      style={{
        fontSize: 10,
        color: 'var(--tx3)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontFamily: 'var(--mono)' }}>{id}</span>
      {project && (
        <>
          <span style={{ color: 'var(--b3)' }}> · </span>
          <span data-queue-project data-changed={sameProject ? undefined : 'true'} style={mark(!sameProject)}>
            {project}
          </span>
        </>
      )}
      {parent && (
        <>
          <span style={{ color: 'var(--b3)' }}> › </span>
          <span data-queue-parent data-changed={sameParent ? undefined : 'true'} style={mark(!sameParent)}>
            {parent}
          </span>
        </>
      )}
    </div>
  );
}

// What the order cannot decide: the dependency a row waits for, and whether
// that work sits below it in the queue.
export function QueueBlockedMark({ id, held, allById }) {
  const { t } = useT();
  const wait = held.get(id);
  if (!wait) return null;
  const late = wait.later.length > 0;
  const names = wait.waitsFor.map(d => {
    const n = allById.get(d);
    return n?.name ? `${d} · ${n.name}` : d;
  });
  return (
    <span
      data-queue-blocked={late ? 'order' : 'dep'}
      data-htip={`${late ? t('wo.blockedLaterTip') : t('wo.blockedTip')}\n${names.join('\n')}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        flexShrink: 0,
        fontSize: 10,
        fontFamily: 'var(--mono)',
        borderRadius: 3,
        padding: '0 4px',
        color: late ? 'var(--st-risk)' : 'var(--tx3)',
        background: late ? 'var(--st-risk-soft)' : 'var(--bg3)',
        border: `1px solid ${late ? 'var(--st-risk)' : 'var(--b2)'}`,
      }}
    >
      <Icon name="link" size={9} />
      {wait.waitsFor[0]}
      {wait.waitsFor.length > 1 ? ` +${wait.waitsFor.length - 1}` : ''}
    </span>
  );
}
