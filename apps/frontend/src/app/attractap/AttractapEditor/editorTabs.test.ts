import { describe, expect, it } from 'vitest';
import { visibleEditorTabs } from './editorTabs';

describe('visibleEditorTabs', () => {
  it('shows every tab for a loaded reader', () => {
    expect(visibleEditorTabs(true, false)).toEqual(['general', 'resources', 'readerUi', 'security']);
  });

  it('shows only general and resources before the reader is loaded', () => {
    expect(visibleEditorTabs(false, false)).toEqual(['general', 'resources']);
  });

  it('hides resources and reader UI for a BLE Bridge', () => {
    expect(visibleEditorTabs(true, true)).toEqual(['general', 'security']);
  });
});
