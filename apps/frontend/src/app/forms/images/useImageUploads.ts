import { useCallback, useEffect, useRef, useState } from 'react';
import { imageUploadProblemFor, type ImageUploadProblem } from './imageUploadProblem';
import { prepareFormImageFile } from './prepareFormImageFile';

interface UseImageUploadsOptions {
  /** Uploads one file and returns the id of the stored image. */
  upload: (file: File) => Promise<string>;
  /** Called with each stored image id once its upload finished. */
  onUploaded?: (imageId: string) => void;
  /** How many more images may still be added, not counting uploads that are running. */
  remaining: number;
  /** Reports whether an upload is running, so the caller can hold its submit button. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Runs the uploads of an image field: at most the free places, each file checked (and shrunk when too large) and
 * uploaded on its own, with a spinner count and the last problem.
 */
export function useImageUploads({ upload, onUploaded, remaining, onBusyChange }: UseImageUploadsOptions) {
  const [pendingCount, setPendingCount] = useState(0);
  const [problem, setProblem] = useState<ImageUploadProblem | null>(null);
  const pending = useRef(0);
  const latest = useRef({ upload, onUploaded, remaining, onBusyChange });
  latest.current = { upload, onUploaded, remaining, onBusyChange };

  useEffect(() => () => latest.current.onBusyChange?.(false), []);

  const addFiles = useCallback(async (files: File[]) => {
    const room = Math.max(0, latest.current.remaining - pending.current);
    const accepted = files.slice(0, room);
    setProblem(files.length > accepted.length ? { kind: 'max' } : null);
    if (!accepted.length) return;

    pending.current += accepted.length;
    setPendingCount(pending.current);
    latest.current.onBusyChange?.(true);
    await Promise.all(
      accepted.map(async (file) => {
        try {
          const imageId = await latest.current.upload(await prepareFormImageFile(file));
          latest.current.onUploaded?.(imageId);
        } catch (error) {
          setProblem(imageUploadProblemFor(error));
        } finally {
          pending.current -= 1;
          setPendingCount(pending.current);
          if (pending.current === 0) latest.current.onBusyChange?.(false);
        }
      }),
    );
  }, []);

  const clearProblem = useCallback(() => setProblem(null), []);

  return { pendingCount, problem, addFiles, clearProblem };
}
