import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@attraccess/react-query-client';
import { FormPhotoPage } from './FormPhotoPage';

const api = vi.hoisted(() => ({ page: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  formPhotoGetPage: api.page,
  formPhotoUpload: api.upload,
  formPhotoRemoveImage: api.remove,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../forms/images/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: () => ({ src: 'blob:image', isLoading: false, isError: false }),
}));

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));
afterEach(cleanup);

const ID = '3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01';
const apiError = (status: number) =>
  new ApiError({ method: 'GET', url: '/x' }, { body: {}, ok: false, status, statusText: '', url: '/x' }, 'Failed');
const gone = () => apiError(410);
const pageData = (overrides = {}) => ({
  resourceName: 'Laser',
  formName: 'Check-in',
  fieldName: 'Damage photo',
  fieldDescription: null,
  maxImages: 2,
  uploadsRemaining: 2,
  expiresAt: new Date().toISOString(),
  images: [],
  ...overrides,
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/form-photo/tok-123']}>
      <Routes>
        <Route path="/form-photo/:token" element={<FormPhotoPage />} />
      </Routes>
    </MemoryRouter>,
  );
const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
const pick = (id: string) => fireEvent.change(screen.getByTestId(id), { target: { files: [photo()] } });

it('shows the field and the controls for a valid link, asking the API with the token', async () => {
  api.page.mockResolvedValue({ data: pageData() });
  mount();
  expect(await screen.findByText('Damage photo')).toBeTruthy();
  expect(api.page).toHaveBeenCalledWith(expect.objectContaining({ path: { token: 'tok-123' } }));
  expect(screen.getByTestId('image-input-camera').getAttribute('capture')).toBe('environment');
  expect(screen.queryByText('done')).toBeNull();
});

it('shows the expired state when the link is gone (410)', async () => {
  api.page.mockRejectedValue(gone());
  mount();
  expect(await screen.findByText('expired')).toBeTruthy();
  expect(screen.queryByTestId('image-input-camera')).toBeNull();
});

it('shows a plain error, not the expired state, when the page cannot be loaded', async () => {
  api.page.mockRejectedValue(new Error('offline'));
  mount();
  expect(await screen.findByText('loadError')).toBeTruthy();
  expect(screen.getByText('loadErrorTitle')).toBeTruthy();
  expect(screen.queryByText('expired')).toBeNull();
});

it('uploads, shows a spinner and then the photo with the done message', async () => {
  api.page.mockResolvedValue({ data: pageData() });
  let finish: (value: unknown) => void = () => undefined;
  api.upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  mount();
  await screen.findByText('Damage photo');

  pick('image-input-upload');

  expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0);
  await act(async () => finish({ data: { id: ID, width: 1, height: 1 } }));
  expect(await screen.findByAltText('altNamed')).toBeTruthy();
  expect(screen.getByText('done')).toBeTruthy();
});

it('stays done after the last allowed upload used the link up', async () => {
  api.page.mockResolvedValue({ data: pageData({ maxImages: 1, uploadsRemaining: 1 }) });
  api.upload.mockResolvedValue({ data: { id: ID, width: 1, height: 1 } });
  mount();
  await screen.findByText('Damage photo');

  pick('image-input-camera');

  expect(await screen.findByText('doneUsedUp')).toBeTruthy();
  expect(screen.queryByText('expired')).toBeNull();
  expect(screen.queryByTestId('image-input-camera')).toBeNull();
  expect(screen.queryByText('remaining')).toBeNull();
  expect(screen.getByText('count')).toBeTruthy();
  expect(api.page).toHaveBeenCalledTimes(1);
});

it('offers the picker again after a photo of a used-up link is removed', async () => {
  api.page.mockResolvedValue({ data: pageData({ maxImages: 1, uploadsRemaining: 1 }) });
  api.upload.mockResolvedValue({ data: { id: ID, width: 1, height: 1 } });
  api.remove.mockResolvedValue({});
  mount();
  await screen.findByText('Damage photo');
  pick('image-input-upload');
  expect(await screen.findByText('doneUsedUp')).toBeTruthy();
  expect(screen.queryByTestId('image-input-upload')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'removeNamed' }));

  expect(await screen.findByTestId('image-input-upload')).toBeTruthy();
  expect(screen.queryByText('doneUsedUp')).toBeNull();
  expect(screen.getByText('remaining')).toBeTruthy();
});

it('says so when a photo cannot be removed, and keeps it', async () => {
  api.page.mockResolvedValue({ data: pageData({ images: [{ id: ID, width: 1, height: 1 }] }) });
  api.remove.mockRejectedValue(apiError(500));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'removeNamed' }));
  expect(await screen.findByText('removeError')).toBeTruthy();
  expect(screen.getByAltText('altNamed')).toBeTruthy();
});

it('removes a photo through the token', async () => {
  api.page.mockResolvedValue({ data: pageData({ images: [{ id: ID, width: 1, height: 1 }] }) });
  api.remove.mockResolvedValue({});
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'removeNamed' }));
  await waitFor(() => expect(screen.queryByAltText('altNamed')).toBeNull());
  expect(api.remove).toHaveBeenCalledWith(expect.objectContaining({ path: { token: 'tok-123', imageId: ID } }));
});

it('turns into the expired state when an upload meets a gone link', async () => {
  api.page.mockResolvedValue({ data: pageData() });
  api.upload.mockRejectedValue(gone());
  mount();
  await screen.findByText('Damage photo');
  pick('image-input-upload');
  expect(await screen.findByText('expired')).toBeTruthy();
});
