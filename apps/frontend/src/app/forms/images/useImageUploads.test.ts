import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { useImageUploads } from './useImageUploads';

const scale = vi.hoisted(() => vi.fn());
vi.mock('../../../components/imageUpload/imageProcessing', () => ({ processImageWithAutoScale: scale }));

const MB = 1024 * 1024;
const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'photo', { type });
const apiError = (status: number, body: unknown = {}) =>
  new ApiError({ method: 'POST', url: '/x' }, { body, ok: false, status, statusText: '', url: '/x' }, 'Request failed');

beforeEach(() => {
  scale.mockReset();
});

async function addWith(upload: (file: File) => Promise<string>, picked: File) {
  const onUploaded = vi.fn();
  const { result } = renderHook(() => useImageUploads({ upload, onUploaded, remaining: 3 }));
  await act(() => result.current.addFiles([picked]));
  return { problem: result.current.problem, onUploaded };
}

it('refuses a file that is not a JPEG, PNG or WebP before uploading', async () => {
  const upload = vi.fn();
  const { problem } = await addWith(upload, file('image/heic'));
  expect(problem).toEqual({ kind: 'type' });
  expect(upload).not.toHaveBeenCalled();
});

it('uploads a small photo as it is', async () => {
  const upload = vi.fn().mockResolvedValue('id-1');
  const picked = file('image/png');
  const { problem, onUploaded } = await addWith(upload, picked);
  expect(upload).toHaveBeenCalledWith(picked);
  expect(onUploaded).toHaveBeenCalledWith('id-1');
  expect(problem).toBeNull();
  expect(scale).not.toHaveBeenCalled();
});

it('shrinks a photo over the size limit in the browser before uploading it', async () => {
  const smaller = file('image/jpeg', 100);
  scale.mockResolvedValue(smaller);
  const upload = vi.fn().mockResolvedValue('id-2');
  await addWith(upload, file('image/jpeg', 11 * MB));
  expect(scale).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxBytes: 10 * MB, output: 'jpeg' }));
  expect(upload).toHaveBeenCalledWith(smaller);
});

it('reports a too large photo that cannot be shrunk', async () => {
  scale.mockImplementation(async () => {
    throw new Error('no canvas');
  });
  const upload = vi.fn();
  const { problem } = await addWith(upload, file('image/webp', 11 * MB));
  expect(problem).toEqual({ kind: 'size' });
  expect(upload).not.toHaveBeenCalled();
});

it.each([
  [apiError(429), { kind: 'rateLimited' }],
  [
    apiError(400, { message: 'The file is not a readable JPEG, PNG or WebP image.' }),
    {
      kind: 'rejected',
      message: 'The file is not a readable JPEG, PNG or WebP image.',
    },
  ],
  [apiError(400), { kind: 'upload' }],
  [apiError(500), { kind: 'upload' }],
  [new Error('offline'), { kind: 'upload' }],
])('tells why the server refused the upload (%s)', async (error, expected) => {
  const { problem, onUploaded } = await addWith(vi.fn().mockRejectedValue(error), file('image/jpeg'));
  expect(problem).toEqual(expected);
  expect(onUploaded).not.toHaveBeenCalled();
});
