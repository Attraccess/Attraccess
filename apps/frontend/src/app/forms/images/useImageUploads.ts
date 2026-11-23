import { useCallback, useEffect, useRef, useState } from 'react';

interface UseImageUploadsOptions {
  /** Uploads one file and returns the id of the stored image. */
  upload: (file: File) => Promise<string>;
  /** Called with each stored image id once its upload finished. */
  onUploaded: (imageId: string) => void;
  /** How many more images may still be added, not counting uploads that are running. */
  remaining: number;
  /** Reports whether an upload is running, so the caller can hold its submit button. */
  onBusyChange?: (busy: boolean) => void;
}

export type ImageUploadProblem = 'upload' | 'max' | null;

/** Runs the uploads of an image field: at most the free places, each file on its own, with a spinner count. */
export function useImageUploads({ upload, onUploaded, remaining, onBusyChange }: UseImageUploadsOptions) {
  const [pendingCount, setPendingCount] = useState(0);
  const [problem, setProblem] = useState<ImageUploadProblem>(null);
  const pending = useRef(0);
  const latest = useRef({ upload, onUploaded, remaining, onBusyChange });
  latest.current = { upload, onUploaded, remaining, onBusyChange };

  useEffect(() => () => latest.current.onBusyChange?.(false), []);

  const addFiles = useCallback(async (files: File[]) => {
    const room = Math.max(0, latest.current.remaining - pending.current);
    const accepted = files.slice(0, room);
    setProblem(files.length > accepted.length ? 'max' : null);
    if (!accepted.length) return;

    pending.current += accepted.length;
    setPendingCount(pending.current);
    latest.current.onBusyChange?.(true);
    await Promise.all(
      accepted.map(async (file) => {
        try {
          latest.current.onUploaded(await latest.current.upload(file));
        } catch {
          setProblem('upload');
        } finally {
          pending.current -= 1;
          setPendingCount(pending.current);
          if (pending.current === 0) latest.current.onBusyChange?.(false);
        }
      }),
    );
  }, []);

  return { pendingCount, problem, addFiles, clearProblem: () => setProblem(null) };
}
