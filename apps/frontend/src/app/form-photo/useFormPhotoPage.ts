import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  formPhotoGetPage,
  formPhotoRemoveImage,
  formPhotoUpload,
  type FormPhotoPageDto,
} from '@attraccess/react-query-client';

export type FormPhotoState =
  | { status: 'loading' }
  | { status: 'expired' }
  | { status: 'error' }
  | { status: 'ready'; page: FormPhotoPageDto; images: string[]; uploadsRemaining: number; isUsedUp: boolean };

const isGone = (error: unknown) => error instanceof ApiError && error.status === 410;

/**
 * The phone page of a reader handoff link. The last allowed upload uses the link up (the server refuses further
 * uploads), so the page keeps what it has locally and does not ask again: it shows "done", not "expired". `remove`
 * throws when the server refuses for another reason than an expired link.
 */
export function useFormPhotoPage(token: string) {
  const [state, setState] = useState<FormPhotoState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    formPhotoGetPage({ path: { token }, throwOnError: true })
      .then(({ data }) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          page: data,
          images: data.images.map((image) => image.id),
          uploadsRemaining: data.uploadsRemaining,
          isUsedUp: data.uploadsRemaining <= 0,
        });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: isGone(error) ? 'expired' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const upload = useCallback(
    async (file: File): Promise<string> => {
      try {
        const { data } = await formPhotoUpload({ path: { token }, body: { image: file }, throwOnError: true });
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                images: [...current.images, data.id],
                uploadsRemaining: current.uploadsRemaining - 1,
                isUsedUp: current.uploadsRemaining - 1 <= 0,
              }
            : current,
        );
        return data.id;
      } catch (error) {
        if (isGone(error)) setState({ status: 'expired' });
        throw error;
      }
    },
    [token],
  );

  /** Removing a photo frees its upload slot on the server, so a used-up link takes photos again. */
  const remove = useCallback(
    async (imageId: string) => {
      try {
        await formPhotoRemoveImage({ path: { token, imageId }, throwOnError: true });
      } catch (error) {
        // A 404 means it is gone already (a second tap): the page drops it like a removal.
        if (isGone(error)) {
          setState({ status: 'expired' });
          return;
        }
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
      setState((current) =>
        current.status === 'ready' && current.images.includes(imageId)
          ? {
              ...current,
              images: current.images.filter((id) => id !== imageId),
              uploadsRemaining: Math.min(current.page.maxImages, current.uploadsRemaining + 1),
              isUsedUp: false,
            }
          : current,
      );
    },
    [token],
  );

  return { state, upload, remove };
}
