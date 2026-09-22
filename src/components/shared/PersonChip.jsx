import { Icon } from './Icon.jsx';

// Who is doing this — one look, everywhere.
//
// It had four. The tree wrote plain mono initials and an italic `~XX` for a
// suggestion; the Gantt used a grey filled box; the Planning tab used a
// `btn btn-pri` — the loudest control in the app, on every row, for a person's
// initials; and a handoff chain had its own bordered amber variant in two
// places with different padding. Four vocabularies for one fact is three too
// many, and the loudest of them was on the view with the most rows.
//
// The vocabulary that won is the tree's, because it is the quietest: initials
// are an identifier, not a call to action.
//
//   Anna          assigned, by you
//   ~Anna         the schedule's answer, not yours (muted, italic)
//   ⇄ A→B         a handoff chain (amber, because it is worth noticing)
export function PersonChip({ short, auto = false, chain = false, title, style = {} }) {
  if (!short) return null;
  return (
    <span
      data-htip={title}
      data-person-chip={auto ? 'auto' : chain ? 'chain' : 'assigned'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        whiteSpace: 'nowrap',
        color: chain ? 'var(--st-wip)' : auto ? 'var(--tx3)' : 'var(--tx2)',
        fontWeight: chain ? 600 : 400,
        fontStyle: auto ? 'italic' : 'normal',
        ...style,
      }}
    >
      {chain && <Icon name="swap" size={11} />}
      {auto && <span aria-hidden="true" style={{ opacity: .7 }}>~</span>}
      {short}
    </span>
  );
}

export default PersonChip;
