// localStorage, where a missing or blocked store is an ordinary case: every
// read has a fallback and a failed write is dropped.
export function storedText(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function storedFlag(key) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

// A flag that is on until somebody switches it off.
export function storedFlagDefaultOn(key) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}
