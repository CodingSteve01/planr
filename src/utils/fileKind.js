// What a plan file's name says about its format. A leaf module: the loaders,
// the save dialog and the Obsidian host all ask the same question.

/** True for a Markdown plan (`.md`, any case, also `.planr.md`). */
export function isMarkdownName(name) {
  return typeof name === 'string' && /\.md$/i.test(name);
}
