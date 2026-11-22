import { useT } from '../../../i18n.jsx';
import { fixedFrame, toFixedPoint } from '../../../utils/embedHost.js';

// The right-click menu on a node: edit or delete it.
export function NetContextMenu({ ctxMenu, iMap, onDeleteNode, onNodeClick, portalRoot, setCtxMenu, setSelId }) {
  const { t } = useT();
  return (
    <div
      className="layer-popover"
      style={{
        position: 'fixed',
        ...(({ x, y }) => ({ left: x, top: y }))(toFixedPoint(ctxMenu.x, ctxMenu.y, fixedFrame(portalRoot))),
        background: 'var(--bg2)',
        border: '1px solid var(--b2)',
        borderRadius: 'var(--r)',
        padding: 4,
        boxShadow: 'var(--sh)',
        minWidth: 140,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div
        style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
        className="tr"
        onClick={() => {
          onNodeClick(iMap[ctxMenu.id]);
          setCtxMenu(null);
        }}
      >
        {t('net.ctxEdit', iMap[ctxMenu.id]?.name || ctxMenu.id)}
      </div>
      <div
        style={{ padding: '5px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4, color: 'var(--re)' }}
        className="tr"
        onClick={() => {
          onDeleteNode(ctxMenu.id);
          setSelId(null);
          setCtxMenu(null);
        }}
      >
        {t('delete')}
      </div>
    </div>
  );
}
