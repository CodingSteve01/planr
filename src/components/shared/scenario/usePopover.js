import { useEffect } from 'react';

// A popover that closes on an outside click and on Escape — but an Escape
// typed into one of its own text fields belongs to that field first.
function usePopover(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (e.target?.tagName === 'INPUT' && ref.current?.contains(e.target)) return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen, ref]);
}
export { usePopover };
