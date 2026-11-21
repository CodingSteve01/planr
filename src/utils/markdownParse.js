// Markdown plan file → project data. The writer is utils/markdown.js
// (`buildMarkdownText`); this is its other half. It lived inside the App
// component until scenarios needed to read a plan without mounting one.
// The parser itself is in utils/markdown/: parseMd.js runs the phases in order.
export { parseMdToProject } from './markdown/parseMd.js';
