import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Registers the shared API mocks before the component's modules load.
import { DEFAULT_UPDATE_POLICY, hoisted, renderWithQuery } from '../index.test.hoisted';
import { UpdatesAvailableAlert } from './UpdatesAvailableAlert';

function listAvailableUpdate() {
  hoisted.apiMock.mockImplementation(async () => ({
    ok: true,
    json: async () => [
      { name: '@attraccess/plugin-example', version: '1.0.0', updateCheck: { state: 'available', candidate: '1.0.1' } },
    ],
  }));
}

describe('UpdatesAvailableAlert', () => {
  it.each([
    ['automatic updates are off, as by default', DEFAULT_UPDATE_POLICY, /nothing is installed on its own/],
    [
      'automatic updates are on',
      { ...DEFAULT_UPDATE_POLICY, automaticUpdates: true },
      /Attraccess installs the updates its safeguards allow in the next update window/,
    ],
    [
      'the update check is off',
      { ...DEFAULT_UPDATE_POLICY, automaticUpdates: true, checksEnabled: false },
      /nothing is installed on its own/,
    ],
  ])('says what happens when %s', async (_label, policy, message) => {
    listAvailableUpdate();
    hoisted.updatePolicy = policy;
    renderWithQuery(<UpdatesAvailableAlert onReview={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
  });
});
