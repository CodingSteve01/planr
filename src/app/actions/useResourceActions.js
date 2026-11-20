import { useStableCallback } from '../useStableCallback.js';
import { bindActions } from './bindActions.js';
import * as edits from './resourceEdits.js';

// Members, teams, meeting plans, vacations and holidays, through the lens of
// the day being worked on. Takes one object — `members`, `teams`,
// `planStart`, `effDate`, `effFold`, `resLens`, `mutate` and `act` (the node
// actions, for `setD`) — and returns one object of stable callbacks.
export function useResourceActions(args) {
  const ctx = { ...args };
  const b = bindActions(ctx, edits);
  ctx.res = b;
  return {
    onResMeetingPlansUpd: useStableCallback(b.onResMeetingPlansUpd),
    onResMemberUpd: useStableCallback(b.onResMemberUpd),
    onResMemberAdd: useStableCallback(b.onResMemberAdd),
    onResMemberClone: useStableCallback((...a) => b.cloneMember(...a)),
    onResMemberDel: useStableCallback(b.onResMemberDel),
    onResVacUpd: useStableCallback(b.onResVacUpd),
    onResTeamUpd: useStableCallback(b.onResTeamUpd),
    onResTeamAdd: useStableCallback(b.onResTeamAdd),
    onResTeamDel: useStableCallback(b.onResTeamDel),
    onHolUpdate: useStableCallback(b.onHolUpdate),
  };
}
