const STORAGE_KEY = 'attraccess.plugins.removed';

/**
 * A removal reloads the page right away, which would swallow its success toast. The note survives the reload in this
 * tab, so the plugins page can show the toast once it is back. Without browser storage the toast is skipped; the
 * restart banner still shows.
 */
export function rememberPluginRemoval(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage unavailable: the banner alone tells the admin what is pending.
  }
}

/** Whether a removal happened just before this page load; reading the note clears it. */
export function takePluginRemoval(): boolean {
  try {
    const removed = sessionStorage.getItem(STORAGE_KEY) !== null;
    sessionStorage.removeItem(STORAGE_KEY);
    return removed;
  } catch {
    return false;
  }
}
