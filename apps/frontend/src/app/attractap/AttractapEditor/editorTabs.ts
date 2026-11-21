export type EditorTab = 'general' | 'resources' | 'readerUi' | 'security';

/**
 * The editor tabs for a reader. Reader UI and pairing need a loaded reader; a BLE Bridge serves no resource and
 * has no display, so it gets neither the resources nor the reader UI tab.
 */
export function visibleEditorTabs(hasReader: boolean, bleBridge: boolean): EditorTab[] {
  const tabs: EditorTab[] = ['general'];
  if (!bleBridge) tabs.push('resources');
  if (hasReader && !bleBridge) tabs.push('readerUi');
  if (hasReader) tabs.push('security');
  return tabs;
}
