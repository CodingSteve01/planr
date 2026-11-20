export function StatusIcon({ status, progress = 0, style, ariaLabel }) {
  const size = 18;
  const radius = 7.5;
  const center = 9;
  const circ = 2 * Math.PI * radius;

  if (status === 'done') {
    return <svg width={size} height={size} viewBox="0 0 18 18" style={{ verticalAlign: 'middle', display: 'inline-block', ...style }} aria-label={ariaLabel || 'Done'}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--gr)" strokeWidth="1.6" />
      <path d="M5 9.2 L8 12 L13 6" fill="none" stroke="var(--gr)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
  }

  if (status === 'wip') {
    const pct = Math.max(progress ?? 50, 1);
    const off = circ * (1 - pct / 100);
    return <svg width={size} height={size} viewBox="0 0 18 18" style={{ verticalAlign: 'middle', display: 'inline-block', ...style }} aria-label={ariaLabel || `In progress ${pct}%`}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--b3)" strokeWidth="1.5" />
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--am)" strokeWidth="1.8"
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`} />
      {pct > 0 && <text x={center} y={center + 2.5} fontSize={7} textAnchor="middle" fill="var(--tx2)" fontFamily="var(--mono)" fontWeight="600">{Math.round(pct)}</text>}
    </svg>;
  }

  return <svg width={size} height={size} viewBox="0 0 18 18" style={{ verticalAlign: 'middle', display: 'inline-block', ...style }} aria-label={ariaLabel || 'Open'}>
    <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--tx3)" strokeWidth="1.5" />
  </svg>;
}
