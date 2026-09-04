import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadPluginModal } from './UploadPluginModal';

interface UploadOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const hoisted = vi.hoisted(() => ({
  uploadMutateMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  showToast: vi.fn(),
  uploadOptions: undefined as UploadOptions | undefined,
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePluginsServiceUploadPlugin: (options: UploadOptions) => {
    hoisted.uploadOptions = options;
    return { mutate: hoisted.uploadMutateMock, isPending: false };
  },
}));

vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({
    success: hoisted.successToast,
    error: hoisted.errorToast,
    showToast: hoisted.showToast,
  }),
}));

const fileInput = () => document.querySelector('[data-cy="upload-plugin-modal-file-input"]') as HTMLInputElement;
const uploadButton = () => document.querySelector('[data-cy="upload-plugin-modal-upload-button"]') as HTMLButtonElement;
const cancelButton = () => document.querySelector('[data-cy="upload-plugin-modal-cancel-button"]') as HTMLButtonElement;

beforeEach(() => {
  hoisted.uploadMutateMock.mockReset();
  hoisted.successToast.mockReset();
  hoisted.errorToast.mockReset();
  hoisted.uploadOptions = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadPluginModal', () => {
  it('renders nothing while closed', () => {
    render(<UploadPluginModal isOpen={false} onClose={vi.fn()} />);
    expect(document.querySelector('[data-cy="upload-plugin-modal"]')).not.toBeInTheDocument();
  });

  it('renders the title, description, file input and action buttons when open', () => {
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Upload or Update Plugin')).toBeInTheDocument();
    expect(screen.getByText(/If a plugin with the same name is already installed/)).toBeInTheDocument();
    expect(fileInput()).toBeInTheDocument();
    expect(uploadButton()).toBeInTheDocument();
    expect(cancelButton()).toBeInTheDocument();
  });

  it('disables the upload button until a file is selected', () => {
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);
    expect(uploadButton()).toBeDisabled();
  });

  // Regression: a React Aria TextField forces a controlled value="" onto the
  // inner input, which resets a file input's selection on every render and
  // breaks file selection on mobile browsers. The file input must be a plain,
  // native, uncontrolled <input type="file"> so the browser keeps the choice.
  it('renders a native, uncontrolled file input (no forced controlled value)', () => {
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const input = fileInput();
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('file');
    expect(input).not.toHaveAttribute('value');
  });

  it('accepts a zip file reported with a zip mime type but no .zip name', async () => {
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const file = new File(['content'], 'plugin', { type: 'application/zip' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => expect(uploadButton()).not.toBeDisabled());
  });

  it('enables upload and shows the file name after selecting a .zip file', async () => {
    const user = userEvent.setup();
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const file = new File(['content'], 'my-plugin.zip', { type: 'application/zip' });
    await user.upload(fileInput(), file);

    expect(screen.getByText('my-plugin.zip')).toBeInTheDocument();
    expect(uploadButton()).not.toBeDisabled();
  });

  it('marks a non-zip file invalid, shows an error and keeps upload disabled', async () => {
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const file = new File(['content'], 'not-a-plugin.txt', { type: 'text/plain' });
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('not-a-plugin.txt')).toBeInTheDocument());
    expect(uploadButton()).toBeDisabled();
  });

  it('calls uploadPlugin with the selected file when upload is pressed', async () => {
    const user = userEvent.setup();
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const file = new File(['content'], 'my-plugin.zip', { type: 'application/zip' });
    await user.upload(fileInput(), file);
    await user.click(uploadButton());

    expect(hoisted.uploadMutateMock).toHaveBeenCalledWith({
      formData: { pluginZip: file },
    });
  });

  it('does not upload an invalid file even if upload is triggered', async () => {
    const user = userEvent.setup();
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    const file = new File(['content'], 'bad.txt', { type: 'text/plain' });
    await user.upload(fileInput(), file, { applyAccept: false });
    await user.click(uploadButton());

    expect(hoisted.uploadMutateMock).not.toHaveBeenCalled();
  });

  it('shows a success toast and closes after a successful upload', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<UploadPluginModal isOpen onClose={onClose} />);

    hoisted.uploadOptions?.onSuccess?.();

    expect(onClose).toHaveBeenCalled();
    expect(hoisted.successToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
    vi.useRealTimers();
  });

  it('shows an error toast when the upload fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<UploadPluginModal isOpen onClose={vi.fn()} />);

    hoisted.uploadOptions?.onError?.(new Error('boom'));

    expect(hoisted.errorToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error' }));
    expect(consoleError).toHaveBeenCalled();
  });

  it('invokes onClose when cancel is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<UploadPluginModal isOpen onClose={onClose} />);

    await user.click(cancelButton());

    expect(onClose).toHaveBeenCalled();
  });
});
