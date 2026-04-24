import { useState, useEffect, useRef } from 'react';

// Input that updates locally on every keystroke but only commits to the parent
// on blur or Enter. Avoids triggering expensive re-renders on every key press.
// Drop-in replacement for <input>: pass `value` and `onCommit` (instead of onChange).
export function LazyInput({ value, onCommit, type = 'text', ...rest }) {
  const [v, setV] = useState(value ?? '');
  const lastCommittedRef = useRef(value ?? '');
  const vRef = useRef(v);
  // Keep a ref in sync with the latest typed value so the unmount commit
  // (below) sees the real current input — not the stale closure capture.
  vRef.current = v;
  const propValueRef = useRef(value);
  propValueRef.current = value;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const typeRef = useRef(type);
  typeRef.current = type;

  useEffect(() => {
    // Only update local state if the value changed externally (not from our commit)
    if (value !== lastCommittedRef.current) {
      setV(value ?? '');
      lastCommittedRef.current = value ?? '';
    }
  }, [value]);

  // Flush any uncommitted edit when the input unmounts (e.g. modal close
  // button fires before blur, so the onBlur handler never runs). Without
  // this the user's last change is silently lost.
  useEffect(() => () => {
    const t = typeRef.current;
    const raw = vRef.current;
    const newV = t === 'number' ? (raw === '' ? 0 : +raw) : raw;
    if (newV !== propValueRef.current) {
      try { onCommitRef.current?.(newV); } catch { /* ignore */ }
    }
  }, []);

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
