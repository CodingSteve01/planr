// ─── Metro/Subway Roadmap Renderer ────────────────────────────────────────────
// Each project becomes a colored subway line. Stations are depth-2 milestones.
// Routes are pre-computed fixed shapes (like U-Bahn lines), assigned by duration.

export { getLineColor } from './roadmap/palette.js';
export { buildRoutes, boardHeight } from './roadmap/board.js';
export { mergeRoadmapAssignment } from './roadmap/assignment.js';
export { computeRoadmapModel } from './roadmap/model.js';
export { placeStationLabels } from './roadmap/labels.js';
export { splitSvgMarkup } from './roadmap/markup.js';
export { renderRoadmapSvg } from './roadmap/renderSvg.js';
