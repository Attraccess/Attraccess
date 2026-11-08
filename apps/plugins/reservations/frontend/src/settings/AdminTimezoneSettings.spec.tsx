import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../test-utils';
import { AdminTimezoneSettings } from './AdminTimezoneSettings';

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminTimezoneSettings', () => {
  it('shows a spinner while loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container } = renderWithProviders(<AdminTimezoneSettings />);
    expect(container.querySelector('[data-cy="reservations-admin-loading"]')).toBeInTheDocument();
  });

  it('shows a failure with Retry instead of vanishing', async () => {
    const user = userEvent.setup();
    let failing = true;
    mockFetch({
      'GET /settings/global': () =>
        failing ? { status: 500, body: {} } : { body: { timezone: 'UTC', defaultTimezone: 'UTC' } },
    });
    renderWithProviders(<AdminTimezoneSettings />);
    expect(await screen.findByText('The timezone setting could not be loaded')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders nothing on 403', async () => {
    mockFetch({ 'GET /settings/global': () => ({ status: 403, body: { code: 'FORBIDDEN' } }) });
    const { container } = renderWithProviders(<AdminTimezoneSettings />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('keeps showing the saved timezone as current until the new one is saved', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /settings/global': { timezone: 'Europe/Berlin', defaultTimezone: 'UTC' } });
    renderWithProviders(<AdminTimezoneSettings />);
    const current = await screen.findByText('Europe/Berlin', { selector: '[data-cy="reservations-admin-current"]' });
    await user.type(screen.getByRole('textbox', { name: 'Search timezones' }), 'Europe/Paris');
    await user.click(await screen.findByRole('option', { name: 'Europe/Paris' }));
    expect(current).toHaveTextContent('Europe/Berlin');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
