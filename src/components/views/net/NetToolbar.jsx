import { useT } from '../../../i18n.jsx';

// Fit, reset zoom, zoom in/out, and the search position.
export function NetToolbar({ fitToScreen, panRef, searchIdx, searchMatchList, searchMatches, setPan, setZoom, svgRef, zoom, zoomRef }) {
  const { t } = useT();
  return (
    <div className="ng-toolbar">
      <button
        className="btn btn-pri btn-sm"
        onClick={fitToScreen}
        data-htip={searchMatches?.size ? t('ng.fitToMatchesTip') : t('ng.fitToSelectionTip')}
      >
        Fit
      </button>
      <button
        className="btn btn-sec btn-sm"
        onClick={() => {
          const newPan = { x: 12, y: 12 };
          panRef.current = newPan;
          zoomRef.current = 1.5;
          setZoom(1.5);
          setPan(newPan);
        }}
        data-htip={t('ng.resetZoomTip')}
      >
        {Math.round((zoom / 1.5) * 100)}%
      </button>
      <button
        className="btn btn-sec btn-sm"
        onClick={() => {
          const r = svgRef.current?.getBoundingClientRect();
          if (!r) return;
          const mx = r.width / 2,
            my = r.height / 2;
          const cz = zoomRef.current,
            cp = panRef.current;
          const nz = Math.min(3, cz * 1.25);
          const np = { x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) };
          zoomRef.current = nz;
          panRef.current = np;
          setZoom(nz);
          setPan(np);
        }}
      >
        +
      </button>
      <button
        className="btn btn-sec btn-sm"
        onClick={() => {
          const r = svgRef.current?.getBoundingClientRect();
          if (!r) return;
          const mx = r.width / 2,
            my = r.height / 2;
          const cz = zoomRef.current,
            cp = panRef.current;
          const nz = Math.max(0.05, cz * 0.8);
          const np = { x: mx - (mx - cp.x) * (nz / cz), y: my - (my - cp.y) * (nz / cz) };
          zoomRef.current = nz;
          panRef.current = np;
          setZoom(nz);
          setPan(np);
        }}
      >
        −
      </button>
      {searchMatches && (
        <span style={{ fontSize: 12, color: searchMatches.size ? 'var(--am)' : 'var(--re)', fontFamily: 'var(--mono)', marginLeft: 6 }}>
          {searchMatchList.length
            ? `${(((searchIdx % searchMatchList.length) + searchMatchList.length) % searchMatchList.length) + 1} / ${searchMatchList.length}`
            : '0 matches'}
        </span>
      )}
    </div>
  );
}
