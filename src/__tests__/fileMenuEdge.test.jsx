/** @vitest-environment happy-dom */
// Reported: in Obsidian the File menu ran off the right edge of the Planr
// pane. It decided which way to open from the window's width, but the pane
// ends where Obsidian's right sidebar starts and clips what runs past it.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { I18nProvider, ThemeProvider } from '../i18n.jsx';
import { FileMenu } from '../components/shared/FileMenu.jsx';
import { PortalRootContext } from '../utils/embedHost.js';

const rect = (left, width) => ({ left, right: left + width, width, top: 0, bottom: 40, height: 40, x: left, y: 0 });

function mount(host) {
  return render(
    <PortalRootContext.Provider value={host}>
      <I18nProvider><ThemeProvider>
        <FileMenu onLoad={() => {}} onSaveAs={() => {}} onSnapshots={() => {}} onExport={() => {}} onNew={() => {}} />
      </ThemeProvider></I18nProvider>
    </PortalRootContext.Provider>,
  );
}

async function openAt(triggerLeft) {
  const trigger = screen.getByTestId('file-menu-trigger');
  trigger.parentElement.getBoundingClientRect = () => rect(triggerLeft, 80);
  await act(async () => { fireEvent.click(trigger); });
  return screen.getByTestId('file-menu');
}

describe('the File menu near the edge of its pane', () => {
  afterEach(() => cleanup());

  it('opens leftwards when the pane ends before the window does', async () => {
    window.innerWidth = 2000;
    const host = document.createElement('div');
    document.body.appendChild(host);
    // The pane: 0..1000 of a 2000px window. The trigger sits 100px from its end.
    host.getBoundingClientRect = () => rect(0, 1000);
    Object.defineProperty(host, 'offsetWidth', { value: 1000, configurable: true });
    mount(host);
    const menu = await openAt(900);
    expect(menu.style.right).toBe('0px');
    host.remove();
  });

  it('opens rightwards when there is room in the pane', async () => {
    window.innerWidth = 2000;
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () => rect(0, 1000);
    Object.defineProperty(host, 'offsetWidth', { value: 1000, configurable: true });
    mount(host);
    const menu = await openAt(300);
    expect(menu.style.left).toBe('0px');
    host.remove();
  });
});
