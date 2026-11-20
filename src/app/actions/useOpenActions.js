import { useStableCallback } from '../useStableCallback.js';
import { bindActions } from './bindActions.js';
import * as edits from './openEdits.js';

// Click handlers of the panes. Takes one object — `tree`, `scheduled`, the
// modal setters, `exportCtx` — and returns one object of stable callbacks.
// `onBarClick` is not one of them: only the callers below open a dialog.
export function useOpenActions(args) {
  const b = bindActions(args, edits);
  return {
    onGanttBarClick: useStableCallback(b.onGanttBarClick),
    onNetNodeClick: useStableCallback(b.onNetNodeClick),
    onOpenItemDialog: useStableCallback(b.onOpenItemDialog),
    onSumNavigate: useStableCallback(b.onSumNavigate),
    onNetAddNode: useStableCallback(b.onNetAddNode),
    onSumExportTodo: useStableCallback(b.onSumExportTodo),
  };
}
