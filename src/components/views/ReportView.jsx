import { useT } from '../../i18n.jsx';
import { ExportCards } from '../shared/ExportCards.jsx';

// Report mode's primary (only) surface: "a document that works without its
// author" (docs/principles.md, mode table). Same cards, same options, same
// handlers as the Export dialog — rendered as a normal view instead of a
// modal, per phase 3 of the rebuild. See ExportCards.jsx for the shared
// grid; ExportModal.jsx stays reachable from the `/` palette this phase.
export function ReportView(props) {
  const { t } = useT();
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>{t('report.title')}</h2>
        <p className="helper" style={{ margin: 0 }}>{t('report.desc')}</p>
      </div>
      <ExportCards {...props} />
    </div>
  );
}
