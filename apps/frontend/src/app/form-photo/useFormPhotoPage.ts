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
 * The phone page of a reader handoff link. The last allowed upload uses the link up (the server answers 410
 * afterwards), so the page keeps what it has locally and does not ask again: it shows "done", not "expired".
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

  const remove = useCallback(
    async (imageId: string) => {
      try {
        await formPhotoRemoveImage({ path: { token, imageId }, throwOnError: true });
        setState((current) =>
          current.status === 'ready' ? { ...current, images: current.images.filter((id) => id !== imageId) } : current,
        );
      } catch (error) {
        if (isGone(error)) setState({ status: 'expired' });
      }
    },
    [token],
  );

  return { state, upload, remove };
}
