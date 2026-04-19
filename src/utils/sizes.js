// Default T-shirt size catalogue — used when no project-specific sizes are defined.
// label: display name shown in pickers
// days:  best-case day count (pre-fills optimistic/realistic/pessimistic in the wizard)
// factor: default risk/uncertainty factor applied when a size is quick-picked
export const DEFAULT_SIZES = [
  { label: 'XS',  days: 1,  factor: 1.3 },
  { label: 'S',   days: 3,  factor: 1.3 },
  { label: 'M',   days: 7,  factor: 1.4 },
  { label: 'L',   days: 15, factor: 1.5 },
  { label: 'XL',  days: 30, factor: 1.5 },
  { label: 'XXL', days: 45, factor: 1.6 },
];
