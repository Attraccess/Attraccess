import { useCallback, useState } from 'react';

const STORAGE_KEY = 'attraccess.flowEditor.mqttExplorerOpen';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Open state of the explorer panel, remembered per browser. Storage can be unavailable. */
export function useRememberedOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(read);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Remembering is a convenience only.
    }
  }, []);
  return [open, setOpen];
}
