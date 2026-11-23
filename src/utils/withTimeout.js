// How long a read of the user's file (or of the stored file handle) may take
// before the app stops waiting. A file in a cloud-synced folder can wait for a
// download for as long as it likes; the screen must not.
export const FILE_READ_TIMEOUT_MS = 8000;

export class TimeoutError extends Error {
  constructor(step, ms) {
    super(`Timed out after ${ms} ms: ${step}`);
    this.name = 'TimeoutError';
    this.step = step;
  }
}

// Settles like `promise`, or rejects with a TimeoutError after `ms`. `step` is
// a name, or a function returning the name at the moment the limit is hit.
// The promise itself cannot be cancelled: whatever it delivers later is the
// caller's to ignore.
export function withTimeout(promise, ms, step) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(typeof step === 'function' ? step() : step, ms)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
