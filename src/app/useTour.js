import { useState } from 'react';
import { SK } from '../constants.js';
import { store } from './storage.js';

export const TOUR_DONE_KEY = 'planr_tour_done';
const NEW_SEEN_KEY = 'planr_new_seen_v1';

// ── Tour state ──
// tourStep === null → tour closed; 0..N → active step
export function useTour() {
  const [tourStep, setTourStep] = useState(null);
  // Show new-feature popover once for existing users (has a project, hasn't seen v1 yet)
  const [showNewFeat, setShowNewFeat] = useState(() => {
    try {
      const seen = localStorage.getItem(NEW_SEEN_KEY);
      const hasProject = !!localStorage.getItem(SK);
      return !seen && hasProject;
    } catch {
      return false;
    }
  });
  const dismissNewFeat = () => {
    setShowNewFeat(false);
    store(NEW_SEEN_KEY, '1');
  };
  const startTour = () => setTourStep(0);
  const closeTour = () => {
    setTourStep(null);
    store(TOUR_DONE_KEY, '1');
  };
  return { tourStep, setTourStep, showNewFeat, dismissNewFeat, startTour, closeTour };
}
