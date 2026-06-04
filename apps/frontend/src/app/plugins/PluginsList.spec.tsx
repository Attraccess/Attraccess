import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PluginsList } from './PluginsList';

const renderPage = () => render(<PluginsList />, { wrapper: MemoryRouter });

interface DeleteOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

const hoisted = vi.hoisted(() => ({
  deleteMutateMock: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  showToast: vi.fn(),
  plugins: [] as unknown[],
  deleteOptions: undefined as DeleteOptions | undefined,
}));

vi.mock('@attraccess/react-query-client', () => ({
  usePluginsServiceGetPlugins: () => ({ data: hoisted.plugins }),
  usePluginsServiceDeletePlugin: (options: DeleteOptions) => {
    hoisted.deleteOptions = options;
    return { mutate: hoisted.deleteMutateMock, isPending: false };
  },
  usePluginsServiceUploadPlugin: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({
    success: hoisted.successToast,
    error: hoisted.errorToast,
    showToast: hoisted.showToast,
  }),
}));

function makePlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plugin-1',
    name: 'Cool Plugin',
    version: '1.2.3',
    pluginDirectory: '/plugins/cool',
    permissions: ['read:resources', 'write:resources'],
    ...overrides,
  };
}

beforeEach(() => {
  hoisted.deleteMutateMock.mockReset();
  hoisted.successToast.mockReset();
  hoisted.errorToast.mockReset();
  hoisted.plugins = [];
  hoisted.deleteOptions = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginsList', () => {
  it('renders the title, upload button and table headers', () => {
    renderPage();

    expect(screen.getByText('Installed Plugins')).toBeInTheDocument();
    expect(screen.getByText('Upload Plugin')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Directory')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('shows the empty state when no plugins are installed', () => {
    renderPage();
    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('renders a row per plugin with name, version, directory and permission chips', () => {
    hoisted.plugins = [makePlugin()];
    renderPage();

    expect(screen.getByText('Cool Plugin')).toBeInTheDocument();
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('/plugins/cool')).toBeInTheDocument();
    expect(screen.getByText('read:resources')).toBeInTheDocument();
    expect(screen.getByText('write:resources')).toBeInTheDocument();
  });

  it('falls back to a dash for a missing directory and "None requested" for no permissions', () => {
    hoisted.plugins = [makePlugin({ pluginDirectory: '', permissions: [] })];
    renderPage();

    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('None requested')).toBeInTheDocument();
  });

  it('opens the upload drawer when the upload button is pressed', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(document.querySelector('[data-cy="upload-plugin-modal"]')).not.toBeInTheDocument();

    await user.click(screen.getByText('Upload Plugin'));

    await waitFor(() =>
      expect(document.querySelector('[data-cy="upload-plugin-modal"]')).toBeInTheDocument()
    );
  });

  it('opens the delete confirmation modal when a delete button is pressed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderPage();

    await user.click(
      document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]')
      ).toBeInTheDocument()
    );
  });

  it('calls deletePlugin with the plugin id when deletion is confirmed', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderPage();

    await user.click(
      document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element
    );
    const confirm = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]')
    );
    await user.click(confirm as Element);

    expect(hoisted.deleteMutateMock).toHaveBeenCalledWith({ pluginId: 'plugin-1' });
  });

  it('shows a success toast after a successful delete', () => {
    vi.useFakeTimers();
    hoisted.plugins = [makePlugin()];
    renderPage();

    hoisted.deleteOptions?.onSuccess?.();

    expect(hoisted.successToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Success' })
    );
    vi.useRealTimers();
  });

  it('shows an error toast when the delete fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.plugins = [makePlugin()];
    renderPage();

    hoisted.deleteOptions?.onError?.(new Error('boom'));

    expect(hoisted.errorToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error' }));
    expect(consoleError).toHaveBeenCalled();
  });

  it('cancels the delete without calling the mutation', async () => {
    hoisted.plugins = [makePlugin()];
    const user = userEvent.setup();
    renderPage();

    await user.click(
      document.querySelector('[data-cy="plugins-list-delete-plugin-button-plugin-1"]') as Element
    );
    const cancel = await waitFor(() =>
      document.querySelector('[data-cy="plugins-list-delete-confirmation-cancel-button"]')
    );
    await user.click(cancel as Element);

    expect(hoisted.deleteMutateMock).not.toHaveBeenCalled();
  });

  it('renders permission chips scoped to the plugin row', () => {
    hoisted.plugins = [makePlugin({ id: 'p-perms', permissions: ['admin'] })];
    renderPage();

    const container = document.querySelector('[data-cy="plugins-list-permissions-p-perms"]') as HTMLElement;
    expect(container).toBeInTheDocument();
    expect(within(container).getByText('admin')).toBeInTheDocument();
  });
});
