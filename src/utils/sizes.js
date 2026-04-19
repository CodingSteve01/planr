// Default T-shirt size catalogue — used when no project-specific sizes are defined.
// label:  display name shown in pickers
// days:   best-case day count (pre-fills optimistic/realistic/pessimistic in the wizard)
// factor: default risk/uncertainty factor applied when a size is quick-picked
// desc:   optional hint text shown below the size label in pickers (may be empty "")
export const DEFAULT_SIZES = [
  { label: 'XS',  days: 1,  factor: 1.3, desc: 'Triviale Änderung, Konfiguration, Typo-Fix' },
  { label: 'S',   days: 3,  factor: 1.3, desc: 'Kleines Feature, einfacher Bugfix' },
  { label: 'M',   days: 7,  factor: 1.4, desc: 'Standard-Feature, mittlere Komplexität' },
  { label: 'L',   days: 15, factor: 1.5, desc: 'Größeres Feature, mehrere Komponenten' },
  { label: 'XL',  days: 30, factor: 1.5, desc: 'Umfangreiches Feature, übergreifende Änderungen' },
  { label: 'XXL', days: 45, factor: 1.6, desc: 'Epic, komplettes Modul oder System' },
];
