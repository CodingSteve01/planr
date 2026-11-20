import { Icon } from '../shared/Icon.jsx';

export function ExternalChangeBanner({ _t, externalChangeAvailable, reloadFromFile, setExternalChangeAvailable }) {
  return (
    <>
      {/* The file changed on disk. Outside the group above on purpose: that
          group gives up its width first and cuts off what does not fit, and
          this is the one thing in the bar that asks for a decision. */}
      {externalChangeAvailable && (
        <span data-testid="external-change" className="topbar-external">
          <button
            className="btn btn-xs"
            data-testid="external-reload"
            onClick={() => reloadFromFile()}
            data-htip={_t('app.save.reloadTip')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Icon name="restart" size={11} />
            {_t('app.save.externalChanged')}
          </button>
          <button
            className="btn btn-ghost btn-icon sm"
            data-testid="external-dismiss"
            onClick={() => setExternalChangeAvailable(false)}
            aria-label={_t('app.save.dismissExternalTip')}
            data-htip={_t('app.save.dismissExternalTip')}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      )}
    </>
  );
}
