import { useMemo } from 'react';
import { useT } from '../../../i18n.jsx';
import { projectDiffers, teamDiffers } from '../../../utils/scenarioCompare.js';
import { personDiffers, storyLines } from '../../../utils/scenarioUi/compareFigures.js';
import {
  changesSection,
  itemsSection,
  peopleSection,
  projectsSection,
  reportKpis,
  teamsSection,
} from '../../../utils/scenarioUi/reportSections.js';
import { useFmt } from './useFmt.js';
import { useFieldText } from './useFieldText.js';

// The comparison as a document: the same figures and the same words as the
// dialog, as plain rows a PDF can lay out (utils/scenarioReport.js). Built
// here, beside the dialog, so the two cannot drift — a report that says
// something else than the screen it was exported from is worse than none.
// Returns a function; nothing is computed until somebody asks for the PDF.
export function useScenarioReport({ scenario, planName, base, work, comparison, changes, conflicts }) {
  const { t, lang } = useT();
  const fmt = useFmt();
  const text = useFieldText(base, work, fmt);
  return useMemo(() => {
    if (!scenario || !comparison) return null;
    return () => {
      const totals = comparison.totals || {};
      const list = changes || [];
      const projects = (comparison.projects || []).filter(projectDiffers);
      const teams = (comparison.teams || []).filter(teamDiffers);
      const people = (comparison.people || []).filter(personDiffers);
      const items = comparison.items || [];
      const sections = [
        changesSection(t, fmt, text, list),
        projectsSection(t, fmt, projects),
        teamsSection(t, fmt, teams),
        peopleSection(t, fmt, people),
        itemsSection(t, fmt, text, items),
      ];
      return {
        lang,
        planName: planName || '',
        scenarioName: scenario.name || '',
        // The line on every page's footer, in the language's own quotation marks.
        footerName: t('scn.exportSuffix', planName || '', scenario.name || ''),
        kind: t('scn.report.kind'),
        title: t('scn.report.title'),
        subtitle: t('scn.report.sub', planName || '', scenario.name || '', fmt.date(new Date())),
        lede: t('scn.compareLede'),
        story: storyLines(t, fmt, comparison.teams || []).map(l => ({ name: l.name, text: l.text })),
        conflict: conflicts > 0 ? (conflicts === 1 ? t('scn.conflictNoteOne') : t('scn.conflictNote', conflicts)) : '',
        kpis: reportKpis(t, fmt, comparison, totals, list),
        sections,
        foot: t('scn.report.foot'),
      };
    };
  }, [scenario, planName, comparison, changes, conflicts, t, lang, fmt, text]);
}
