import { useEffect, useState } from 'react';

interface ImageUrlState {
  src: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Loads an image with the session cookie and hands out an object URL for it. A plain <img src> would not send the
 * session to an API on another origin, and the API answers 404 for anyone who may not see the image.
 */
export function useAuthenticatedImageUrl(url: string | null): ImageUrlState {
  const [state, setState] = useState<ImageUrlState>({ src: null, isLoading: Boolean(url), isError: false });

  useEffect(() => {
    if (!url) {
      setState({ src: null, isLoading: false, isError: false });
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ src: null, isLoading: true, isError: false });
    // eslint-disable-next-line no-restricted-syntax -- The image is binary and needs the session cookie.
    fetch(url, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, isLoading: false, isError: false });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, isLoading: false, isError: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}
