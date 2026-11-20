// A browser without file access (no showSaveFilePicker) cannot save into a
// file. Saving there has to end in a download of the plan, not in an error.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/filePickers.js', () => ({ filePickerAvailable: () => false, pickFileToOpen: vi.fn(), pickFileToSave: vi.fn() }));
const exportJSON = vi.fn();
vi.mock('../../utils/exports.js', () => ({ exportJSON: (...args) => exportJSON(...args) }));

const { saveToFile } = await import('../fileActions.js');

describe('saving where the browser has no file access', () => {
  beforeEach(() => exportJSON.mockClear());

  it('downloads the plan as it would be saved', async () => {
    const plan = {
      meta: { name: 'Team plan' },
      tree: [{ id: 'P1', name: 'Project' }],
      asOfPending: { P1: { day: '2026-11-10', status: 'wip', progress: 10 } },
    };
    const c = {
      data: plan,
      fileName: '',
      fileDataRef: { current: plan },
      fileHandleRef: { current: null },
      setFileWriteOk: vi.fn(),
      setSaving: vi.fn(),
    };
    await saveToFile(c, false);
    expect(exportJSON).toHaveBeenCalledTimes(1);
    const arg = exportJSON.mock.calls[0][0];
    expect(arg.meta).toEqual({ name: 'Team plan' });
    expect(arg.data.tree).toEqual(plan.tree);
    // What is waiting for a save is not part of a file.
    expect(arg.data.asOfPending).toBeUndefined();
  });
});
