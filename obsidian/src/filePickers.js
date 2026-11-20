// Build-time replacement for src/utils/filePickers.js.
//
// The app asks for a file to open and a place to save one; here both answers
// come out of the vault, so a plan is a note among notes and Obsidian Sync
// carries it. The handles are the same shape the File System Access API
// returns — see vaultFs.js.

import { pickOpenFile, pickSaveFile } from './vaultFs.js';

export function filePickerAvailable() {
  return true;
}

export async function pickFileToOpen() {
  return pickOpenFile();
}

export async function pickFileToSave(options) {
  return pickSaveFile(options);
}
