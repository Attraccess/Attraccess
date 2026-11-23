import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormFieldType, type FormResponseDto } from '@attraccess/react-query-client';
import { ResourceFormsModal } from './ResourceFormsModal';

const upload = vi.hoisted(() => vi.fn());
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  formImagesUpload: upload,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../forms/images/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: () => ({ src: 'blob:image', isLoading: false, isError: false }),
}));

beforeEach(() => upload.mockReset());
afterEach(cleanup);

const IDS = ['3f2b6c1e-8a4d-4b7e-9c11-2d5e7f8a9b01', '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'];

function imageForm(options: Record<string, unknown> | null, isRequired = true): FormResponseDto {
  return {
    id: 7,
    name: 'Check-in',
    fields: [{ id: 4, name: 'Damage', type: FormFieldType.IMAGE, isRequired, options }],
  } as FormResponseDto;
}

const photo = (name = 'photo.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const pick = (testId: string, ...files: File[]) => fireEvent.change(screen.getByTestId(testId), { target: { files } });
const mount = (form: FormResponseDto, submit = vi.fn()) => {
  render(
    <ResourceFormsModal isOpen resourceId={3} action="start" forms={[form]} onSubmit={submit} onCancel={vi.fn()} />,
  );
  return submit;
};

it('offers a camera input and an upload input that accepts only JPEG, PNG and WebP', async () => {
  mount(imageForm({ maxImages: 2 }));
  const camera = await screen.findByTestId('image-input-camera');
  expect(camera.getAttribute('accept')).toBe('image/*');
  expect(camera.getAttribute('capture')).toBe('environment');
  const uploadInput = screen.getByTestId('image-input-upload');
  expect(uploadInput.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
  expect((uploadInput as HTMLInputElement).multiple).toBe(true);
});

it('allows a single file at a time when only one image fits', async () => {
  mount(imageForm(null));
  expect(((await screen.findByTestId('image-input-upload')) as HTMLInputElement).multiple).toBe(false);
});

it('uploads at once, shows the thumbnail and submits the image ids as the answer', async () => {
  upload.mockResolvedValue({ data: { id: IDS[0], width: 10, height: 10 } });
  const submit = mount(imageForm({ maxImages: 2 }));
  await screen.findByTestId('image-input-camera');

  pick('image-input-camera', photo());

  await waitFor(() => expect(screen.getByAltText('altNamed')).toBeTruthy());
  expect(upload).toHaveBeenCalledWith(
    expect.objectContaining({ path: { resourceId: 3, formId: 7, fieldId: 4 }, query: { action: 'start' } }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([{ formId: 7, answers: [{ fieldId: 4, value: [IDS[0]] }] }]);
});

it('holds the submit button while an upload runs', async () => {
  let finish: (value: unknown) => void = () => undefined;
  upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const submit = mount(imageForm({ maxImages: 2 }));
  await screen.findByTestId('image-input-upload');

  pick('image-input-upload', photo());

  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'modal.submit' }) as HTMLButtonElement).disabled).toBe(true),
  );
  expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).not.toHaveBeenCalled();

  await act(async () => finish({ data: { id: IDS[0], width: 1, height: 1 } }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'modal.submit' }) as HTMLButtonElement).disabled).toBe(false),
  );
});

it('removes an image from the answer without any request, so an optional field submits without it', async () => {
  upload.mockResolvedValue({ data: { id: IDS[0], width: 1, height: 1 } });
  const submit = mount(imageForm({ maxImages: 2 }, false));
  await screen.findByTestId('image-input-upload');
  pick('image-input-upload', photo());
  await screen.findByAltText('altNamed');

  fireEvent.click(screen.getByRole('button', { name: 'removeNamed' }));

  expect(screen.queryByAltText('altNamed')).toBeNull();
  expect(upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'modal.submit' }));
  expect(submit).toHaveBeenCalledWith([{ formId: 7, answers: [] }]);
});

it('groups the photo buttons under the field name and refuses other file types before uploading', async () => {
  mount(imageForm({ maxImages: 2 }));
  expect(await screen.findByRole('group', { name: 'Damage' })).toBeTruthy();

  await act(async () => pick('image-input-upload', new File(['x'], 'scan.pdf', { type: 'application/pdf' })));

  expect(await screen.findByText('typeError')).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
});

it('takes no more images than the field allows', async () => {
  upload.mockResolvedValueOnce({ data: { id: IDS[0], width: 1, height: 1 } });
  mount(imageForm({ maxImages: 1 }));
  await screen.findByTestId('image-input-upload');

  pick('image-input-upload', photo('a.jpg'), photo('b.jpg'));

  await screen.findByAltText('altNamed');
  expect(upload).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('maxReached')).toBeTruthy();
});

it('requires an image for a required field, and lets an optional one stay empty', async () => {
  const submit = mount(imageForm({ maxImages: 1 }));
  fireEvent.click(await screen.findByRole('button', { name: 'modal.submit' }));
  expect(await screen.findByText('modal.fieldRequired')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  cleanup();

  const optionalSubmit = mount(imageForm({ maxImages: 1 }, false));
  fireEvent.click(await screen.findByRole('button', { name: 'modal.submit' }));
  expect(optionalSubmit).toHaveBeenCalledWith([{ formId: 7, answers: [] }]);
});

it('shows an error when the upload fails and adds nothing', async () => {
  // A response without data (the SDK call failed) must not add an image.
  upload.mockResolvedValue({});
  mount(imageForm({ maxImages: 1 }));
  await screen.findByTestId('image-input-upload');

  await act(async () => pick('image-input-upload', photo()));
  expect(await screen.findByText('uploadError')).toBeTruthy();
  expect(screen.queryByAltText('altNamed')).toBeNull();
});
