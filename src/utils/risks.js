// Default risk catalogue — used when no project-specific risks are defined.
// Uses i18n keys so the defaults are multi-lingual; user-customized risks use plain text.
export const DEFAULT_RISKS = [
  { id: 'new_tech', i18nKey: 'ew.risk.newTech', weight: 0.15 },
  { id: 'external', i18nKey: 'ew.risk.external', weight: 0.1 },
  { id: 'migration', i18nKey: 'ew.risk.migration', weight: 0.15 },
  { id: 'ux', i18nKey: 'ew.risk.ux', weight: 0.1 },
  { id: 'stakeholder', i18nKey: 'ew.risk.stakeholder', weight: 0.1 },
  { id: 'integration', i18nKey: 'ew.risk.integration', weight: 0.15 },
  { id: 'legacy', i18nKey: 'ew.risk.legacy', weight: 0.1 },
  { id: 'unclear', i18nKey: 'ew.risk.unclear', weight: 0.2 },
];

// Resolve risk name: i18nKey → translated, or plain name for user-defined risks
export function resolveRiskName(risk, t) {
  if (risk.i18nKey) return t(risk.i18nKey);
  return risk.name || risk.id;
}
