import { useState, useEffect, useRef } from 'react';

// Input that updates locally on every keystroke but only commits to the parent
// on blur or Enter. Avoids triggering expensive re-renders on every key press.
// Drop-in replacement for <input>: pass `value` and `onCommit` (instead of onChange).
export function LazyInput({ value, onCommit, type = 'text', ...rest }) {
  const [v, setV] = useState(value ?? '');
  const lastCommittedRef = useRef(value ?? '');

  useEffect(() => {
    // Only update local state if the value changed externally (not from our commit)
    if (value !== lastCommittedRef.current) {
      setV(value ?? '');
      lastCommittedRef.current = value ?? '';
    }
  }, [value]);

  const commit = () => {
    const newV = type === 'number' ? (v === '' ? 0 : +v) : v;
    if (newV !== value) {
      lastCommittedRef.current = newV;
      onCommit(newV);
    }
  };

  return <input
    type={type}
    value={v}
    onChange={e => setV(e.target.value)}
    onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter' && type !== 'textarea') e.target.blur(); }}
    {...rest}
  />;
}
