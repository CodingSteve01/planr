import { useEffect } from 'react';

// Wires the standard dialog keyboard shortcuts so every modal behaves the
// same. Esc closes; Cmd/Ctrl+Enter or plain Enter (when no textarea/input is
// focused with multi-line content) submits the primary action.
//
//   onClose:  called on Escape — always
//   onSubmit: optional, called on Cmd/Ctrl+Enter
//
// Pressing Enter inside <textarea> or contenteditable does NOT submit so the
// user can type newlines / multi-line notes without accidentally applying.
export function useDialogShortcuts(onClose, onSubmit) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        // Some sub-controls (autocomplete, popovers) may also listen for Esc;
        // they should stopPropagation themselves. Default: close the dialog.
        if (typeof onClose === 'function') {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        if (typeof onSubmit === 'function') {
          e.preventDefault();
          onSubmit();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onSubmit]);
}
