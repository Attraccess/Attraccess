import { useEffect } from 'react';

/** Asks the browser to confirm reload, tab close and external navigation while `isDirty`. */
export function useBeforeUnloadWhileDirty(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isDirty]);
}
