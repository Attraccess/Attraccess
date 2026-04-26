export const DISMISSED_VERSION_STORAGE_KEY = 'attraccess:updateBanner:dismissedVersion';

export function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, version);
  } catch {
    console.error('Failed to persist dismissed update version in localStorage');
  }
}

export function clearDismissedVersion(): void {
  try {
    localStorage.removeItem(DISMISSED_VERSION_STORAGE_KEY);
  } catch {
    console.error('Failed to clear dismissed update version in localStorage');
  }
}
