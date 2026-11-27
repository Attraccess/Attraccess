import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Registers the shared API mocks before the component's modules load.
import { DEFAULT_UPDATE_POLICY, hoisted, renderWithQuery } from '../index.test.hoisted';
import { VersionManagementModal } from './VersionManagementModal';

const HINT = /This setting installs nothing until they are turned on/;

const open = () =>
  renderWithQuery(
    <VersionManagementModal plugin={{ name: '@attraccess/plugin-example', version: '1.0.0' }} onClose={vi.fn()} />,
  );

describe('Manage version while automatic updates are off', () => {
  it('says that the plugin setting installs nothing', async () => {
    open();
    expect(await screen.findByText(HINT)).toBeInTheDocument();
  });

  it('says nothing once they are on', async () => {
    hoisted.updatePolicy = { ...DEFAULT_UPDATE_POLICY, automaticUpdates: true };
    open();
    await screen.findByRole('button', { name: 'Save version policy' });
    await waitFor(() => expect(screen.queryByText(HINT)).not.toBeInTheDocument());
  });
});
