import '@testing-library/jest-dom/vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
// Register the shared API mocks before loading the component's feature modules.
import { chooseRowAction, hoisted, makePlugin, renderWithQuery } from './index.test.hoisted';
import { PluginsSection } from './index';

const LEGACY_ERROR =
  'Plugin Cool Plugin targets Attraccess 1.9.0 and the plugin SDK 1.x, which this host no longer supports. ' +
  'Migration guide: https://docs.attraccess.org/#/en/plugins/migrating-to-2';

/** A refused 1.x ZIP copy next to a valid 2.0 npm copy of the same plugin, as the API lists them after an upgrade. */
function legacyAndCurrentCopies() {
  hoisted.plugins = [
    makePlugin({
      id: 'legacy-id',
      version: '1.0.0',
      pluginDirectory: 'cool-legacy',
      status: 'error',
      refused: true,
      error: LEGACY_ERROR,
    }),
    makePlugin({ id: 'current-id', version: '2.0.0', pluginDirectory: 'npm-cool', status: 'loaded', error: null }),
  ];
  const installed = { name: 'Cool Plugin', version: '2.0.0', installPath: 'npm-cool', registryId: 'npm' };
  hoisted.apiMock.mockImplementation((url: string) =>
    Promise.resolve({ ok: true, json: async () => (url.endsWith('/api/plugins/installed') ? [installed] : []) }),
  );
}

async function openRemoval(pluginId: string) {
  const user = userEvent.setup();
  renderWithQuery(<PluginsSection />);
  await user.click(document.querySelector(`[data-cy="plugins-list-actions-button-${pluginId}"]`) as Element);
  await user.click(document.querySelector(`[data-cy="plugins-list-delete-plugin-button-${pluginId}"]`) as Element);
  const message = await waitFor(() => {
    const element = document.querySelector('[data-cy="plugins-list-delete-confirmation-message"]');
    expect(element).toBeInTheDocument();
    return element as HTMLElement;
  });
  return { user, message };
}

describe('PluginsSection with refused plugins', () => {
  it('lists a refused copy and a valid copy of the same name as two rows', async () => {
    legacyAndCurrentCopies();
    renderWithQuery(<PluginsSection />);

    expect(screen.getAllByText('Cool Plugin')).toHaveLength(2);
    expect(screen.getByText('Refused')).toBeInTheDocument();
    expect(screen.getByText('Loaded')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="plugins-list-actions-button-legacy-id"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="plugins-list-actions-button-current-id"]')).toBeInTheDocument();
  });

  it('explains a refused plugin and offers to remove it instead of a retry', async () => {
    legacyAndCurrentCopies();
    const user = userEvent.setup();
    renderWithQuery(<PluginsSection />);

    await user.click(screen.getByRole('button', { name: 'View load error for Cool Plugin' }));
    expect(await screen.findByRole('heading', { name: 'Attraccess refused Cool Plugin' })).toBeInTheDocument();
    const dialog = document.querySelector('[data-cy="plugins-list-load-error-modal"]') as HTMLElement;
    expect(within(dialog).getByText(LEGACY_ERROR)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Retry and restart' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Remove plugin' }));

    const message = await waitFor(() => document.querySelector('[data-cy="plugins-list-delete-confirmation-message"]'));
    expect(message).toHaveTextContent('Remove the refused plugin Cool Plugin?');
    expect(hoisted.retryMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('deletes the refused ZIP copy by id, never the npm package of the same name', async () => {
    legacyAndCurrentCopies();
    const { user, message } = await openRemoval('legacy-id');

    expect(message).toHaveTextContent('Its stored data stays in the database');
    await user.click(document.querySelector('[data-cy="plugins-list-delete-confirmation-delete-button"]') as Element);

    expect(hoisted.deleteMutateMock).toHaveBeenCalledWith({ path: { pluginId: 'legacy-id' } });
    expect(hoisted.removeGraphMock).not.toHaveBeenCalled();
  });

  it('says that removing an npm plugin keeps its data', async () => {
    legacyAndCurrentCopies();
    const { message } = await openRemoval('current-id');

    expect(message).toHaveTextContent('Its data and secrets are kept');
  });

  it('warns that removing an uploaded plugin deletes its data', async () => {
    hoisted.plugins = [makePlugin({ status: 'loaded', error: null })];
    const { message } = await openRemoval('plugin-1');

    expect(message).toHaveTextContent('all of its stored data will be deleted permanently');
  });
});
