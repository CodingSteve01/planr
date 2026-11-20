// "The schedule picked this person, you did not."
//
// It used to be a dashed amber box. On a real plan that is a dashed amber box
// on most rows — amber means "watch this" everywhere else in the app, so a
// routine fact read as a standing warning, and the box itself competed with
// the name inside it.
//
// The Work order view already had the right answer for the same fact: a `~`
// in front of the name, muted and italic. One vocabulary, so it is the same
// thing being said in both places.
export function AutoAssignBadge({ children, title, style = {} }) {
  return (
    <span
      data-htip={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        color: 'var(--tx3)',
        fontStyle: 'italic',
        fontSize: 11,
        lineHeight: 1.2,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ opacity: .7 }}>~</span>{children}
    </span>
  );
}
