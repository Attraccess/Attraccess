import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageUpload } from './index';
const mocks = vi.hoisted(() => ({ error: vi.fn(), process: vi.fn() }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../toastProvider', () => ({ useToastMessage: () => ({ error: mocks.error }) }));
vi.mock('./imageProcessing', () => ({ processImageWithAutoScale: mocks.process }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('previews selected files, releases the object URL and removes existing images', async () => {
  const change = vi.fn();
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  const view = render(<ImageUpload id="photo" label="Photo" onChange={change} currentImageUrl="/old.png" />);
  expect(screen.getByAltText('Preview')).toHaveAttribute('src', '/old.png');
  fireEvent.change(screen.getByLabelText('Photo'), { target: { files: [file] } });
  await waitFor(() => expect(change).toHaveBeenCalledWith(file));
  expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:preview');
  fireEvent.click(screen.getByRole('button'));
  expect(change).toHaveBeenLastCalledWith(null);
  expect(screen.queryByAltText('Preview')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  view.unmount();
});
it('rejects unsupported types and oversized images and handles empty selection', async () => {
  const change = vi.fn();
  render(<ImageUpload id="photo" label="Photo" onChange={change} />);
  const input = screen.getByLabelText('Photo');
  fireEvent.change(input, { target: { files: [new File(['text'], 'file.txt', { type: 'text/plain' })] } });
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'invalidFileType' })));
  const huge = new File(['image'], 'large.png', { type: 'image/png' });
  Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
  fireEvent.change(input, { target: { files: [huge] } });
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'fileTooLarge' })));
  fireEvent.change(input, { target: { files: [] } });
  expect(change).toHaveBeenLastCalledWith(null);
});
it('scales dropped images and handles drag state and empty drops', async () => {
  const change = vi.fn();
  const processed = new File(['scaled'], 'scaled.webp', { type: 'image/webp' });
  mocks.process.mockResolvedValue(processed);
  render(<ImageUpload id="photo" label="Photo" onChange={change} autoScale={{ maxBytes: 1000 }} />);
  const target = screen.getByLabelText('Photo').parentElement as HTMLElement;
  fireEvent.dragOver(target);
  expect(target.className).toContain('border-accent');
  fireEvent.dragLeave(target);
  expect(target.className).not.toContain('border-accent');
  fireEvent.drop(target, { dataTransfer: { files: [] } });
  expect(change).not.toHaveBeenCalled();
  const original = new File(['raw'], 'raw.png', { type: 'image/png' });
  fireEvent.drop(target, { dataTransfer: { files: [original] } });
  await waitFor(() => expect(change).toHaveBeenCalledWith(processed));
  expect(mocks.process).toHaveBeenCalledWith(original, { maxBytes: 1000 });
});
it.each(['select', 'drop'])('clears the preview when %s processing fails or returns an invalid image', async (mode) => {
  const change = vi.fn();
  const original = new File(['raw'], 'raw.png', { type: 'image/png' });
  render(<ImageUpload id="photo" label="Photo" onChange={change} autoScale={{ maxBytes: 1000 }} />);
  const input = screen.getByLabelText('Photo');
  const submit = () =>
    mode === 'select'
      ? fireEvent.change(input, { target: { files: [original] } })
      : fireEvent.drop(input.parentElement as HTMLElement, { dataTransfer: { files: [original] } });
  for (const failure of ['decode', 'type']) {
    mocks.process.mockResolvedValueOnce(original);
    submit();
    await waitFor(() => expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'blob:preview'));
    change.mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    if (failure === 'decode') mocks.process.mockRejectedValueOnce(new Error('Decode failed'));
    else mocks.process.mockResolvedValueOnce(new File(['bad'], 'bad.txt', { type: 'text/plain' }));
    submit();
    await waitFor(() => expect(change).toHaveBeenCalledWith(null));
    expect(screen.queryByAltText('Preview')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  }
});
