// One answer to "how much of this person is there on that day?".
//
// The scheduler books against the people as `compileMembers` flattens them
// (utils/effective.js): every dated change applied, every meeting plan
// resolved. The schedule's availability band and the resource-load matrix
// used to work it out for themselves from the raw members — which is a second
// source, and the moment dated changes moved out of the member it was a wrong
// one: somebody going to 50 % in March still showed at 100 %. They ask here
// now, so what is drawn as available is what was scheduled against.
import { createContext, useContext } from 'react';
import { deriveCap, memberAtDate } from './capacity.js';

// From compiled members to a lookup. `null` for somebody not in the list, so a
// caller can fall back to what it knows.
export function capacityLookup(compiledMembers) {
  const byId = new Map((compiledMembers || []).map(m => [m.id, m]));
  return (memberId, date) => {
    const m = byId.get(memberId);
    return m ? deriveCap(memberAtDate(m, date)) : null;
  };
}

const CapacityContext = createContext(null);
export const CapacityProvider = CapacityContext.Provider;
export const useCapacityAt = () => useContext(CapacityContext);
