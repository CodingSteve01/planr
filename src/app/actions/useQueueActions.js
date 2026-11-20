import { useStableCallback } from '../useStableCallback.js';
import { bindActions } from './bindActions.js';
import * as edits from './queueEdits.js';

// A person's own order of work. Takes one object — `tree`, `leaves`, `mutate`
// — and returns one object of stable callbacks.
export function useQueueActions(args) {
  const b = bindActions(args, edits);
  return {
    onQueueReset: useStableCallback(b.onQueueReset),
    onQueueReorder: useStableCallback(b.onQueueReorder),
  };
}
