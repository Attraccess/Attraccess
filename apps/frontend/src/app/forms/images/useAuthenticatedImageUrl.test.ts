import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAuthenticatedImageUrl } from './useAuthenticatedImageUrl';

const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => 'blob:photo');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('loads the image with the session cookie and frees the object URL on unmount', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['x'])) });
  const { result, unmount } = renderHook(() => useAuthenticatedImageUrl('https://api.test/api/forms/images/a'));
  expect(result.current.isLoading).toBe(true);

  await waitFor(() => expect(result.current.src).toBe('blob:photo'));
  expect(result.current).toEqual({ src: 'blob:photo', isLoading: false, isError: false });
  expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/forms/images/a', { credentials: 'include' });

  unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:photo');
});

it('reports an error for an image the viewer may not see (404)', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404 });
  const { result } = renderHook(() => useAuthenticatedImageUrl('https://api.test/api/forms/images/b'));
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current).toEqual({ src: null, isLoading: false, isError: true });
  expect(createObjectURL).not.toHaveBeenCalled();
});

it('loads nothing without a URL', () => {
  const { result } = renderHook(() => useAuthenticatedImageUrl(null));
  expect(result.current).toEqual({ src: null, isLoading: false, isError: false });
  expect(fetchMock).not.toHaveBeenCalled();
});
