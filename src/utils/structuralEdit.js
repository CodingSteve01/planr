// "And then I cannot even undo it."
//
// ⌘Z is deliberately left to the browser while focus is in a text field, so
// that undoing a typo undoes the typo and not the last thing that happened to
// the plan. That is right for typing — and wrong the moment a keystroke inside
// a field changes the STRUCTURE instead of the text, because then the only way
// back is to click away first and press ⌘Z there, which nobody thinks of while
// watching their tree rearrange itself.
//
// So a structure command issued from inside a field says so here. Until the
// next keystroke actually edits the text, ⌘Z belongs to the app.

let pending = false;

export function markStructuralEdit() { pending = true; }

/** Cleared by the next real text edit — typing means the text owns undo again. */
export function clearStructuralEdit() { pending = false; }

export function structuralEditPending() { return pending; }
