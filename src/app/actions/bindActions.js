// The action modules export plain functions that take their context first.
// A hook builds that context once per render and binds the functions to it, so
// each one still sees what the render saw, exactly as a closure inside the
// component did.
export function bindActions(ctx, defs) {
  const bound = {};
  for (const name of Object.keys(defs)) {
    const fn = defs[name];
    bound[name] = (...args) => fn(ctx, ...args);
  }
  return bound;
}

// Several objects of named functions as one. A name that two of them carry is
// a mistake, not a preference for the later one.
export function mergeNamed(...parts) {
  const out = {};
  for (const part of parts) {
    for (const name of Object.keys(part)) {
      if (name in out) throw new Error(`two actions are called "${name}"`);
      out[name] = part[name];
    }
  }
  return out;
}
