import { useToastMessage } from '../components/toastProvider';

export interface CopyToastText {
  title: string;
  description: string;
}

/**
 * Returns a function that copies text to the clipboard and toasts the outcome. The caller supplies
 * the texts, so each screen keeps its own wording. Nothing to copy, a browser without the Clipboard
 * API and a rejected write all end in the failure toast.
 */
export function useCopyToClipboard(failure: CopyToastText) {
  const toast = useToastMessage();
  return async (text: string | undefined, success: CopyToastText) => {
    if (!text || !navigator?.clipboard?.writeText) {
      toast.error(failure);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error(failure);
    }
  };
}
