// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionSettings } from './api';
import { SettingsForm } from './SettingsForm';
import { validateCa, validateCredential, validateUrl } from './settingsValidation';
import { configuredSettings } from './test-utils/fixtures';

configure({ testIdAttribute: 'data-cy' });

const TOKEN = 'secret-token-0123456789-0123456789-abc';
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUAAAA\n-----END CERTIFICATE-----';

afterEach(cleanup);

function setup(settings: ConnectionSettings = configuredSettings) {
  const onSave = vi.fn(async () => settings);
  const onRemove = vi.fn(async () => undefined);
  const view = render(<SettingsForm settings={settings} onSave={onSave} onRemove={onRemove} />);
  const update = (next: ConnectionSettings) =>
    view.rerender(<SettingsForm settings={next} onSave={onSave} onRemove={onRemove} />);
  return { onSave, onRemove, update };
}

const urlInput = () => screen.getByLabelText(/Sidecar URL/);
const save = () => screen.getByRole('button', { name: 'Save' });

describe('validation before saving (ATT-1202)', () => {
  it.each([
    ['', null],
    ['https://matter.example.com', null],
    ['http://127.0.0.1:8581/prefix', null],
    ['ftp://matter.example.com', 'urlScheme'],
    ['ws://matter.example.com', 'urlScheme'],
    ['matter.example.com', 'urlInvalid'],
    ['https://user:pass@matter.example.com', 'urlInvalid'],
    ['https://matter.example.com/?a=1', 'urlInvalid'],
    ['https://matter.example.com/#x', 'urlInvalid'],
    [`https://matter.example.com/${'a'.repeat(2100)}`, 'urlTooLong'],
  ])('validateUrl(%j) = %j', (value, expected) => expect(validateUrl(value)).toBe(expected));

  it.each([
    ['', null],
    ['x'.repeat(32), null],
    ['x'.repeat(512), null],
    ['x'.repeat(31), 'credential'],
    ['x'.repeat(513), 'credential'],
    [`${'x'.repeat(31)} `, 'credential'],
    [`${'x'.repeat(31)}ä`, 'credential'],
  ])('validateCredential(%j) = %j', (value, expected) => expect(validateCredential(value)).toBe(expected));

  it.each([
    ['', null],
    [CERT, null],
    [`${CERT}\n${CERT}`, null],
    ['not a certificate', 'caShape'],
    [`${CERT}\ntrailing text`, 'caShape'],
    [`-----BEGIN CERTIFICATE-----\n${'A'.repeat(70_000)}\n-----END CERTIFICATE-----`, 'caTooLong'],
  ])('validateCa(%#) = %j', (value, expected) => expect(validateCa(value)).toBe(expected));

  it('shows the URL error next to the field and keeps Save disabled', async () => {
    const user = userEvent.setup();
    setup({ ...configuredSettings, url: null, credentialConfigured: false, caCertificate: null, updatedAt: null });
    await user.type(urlInput(), 'ftp://matter.example.com');
    expect(await screen.findByTestId('matter-url-error')).toHaveTextContent('must start with http:// or https://');
    await user.type(screen.getByLabelText(/^Token/), TOKEN);
    expect(save()).toBeDisabled();
    await user.clear(urlInput());
    await user.type(urlInput(), 'http://127.0.0.1:8581');
    expect(screen.queryByTestId('matter-url-error')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('checks the token length while typing and never echoes it', async () => {
    const user = userEvent.setup();
    setup({ ...configuredSettings, url: null, credentialConfigured: false, caCertificate: null, updatedAt: null });
    await user.type(urlInput(), 'http://127.0.0.1:8581');
    await user.type(screen.getByLabelText(/^Token/), 'too-short');
    expect(await screen.findByTestId('matter-credential-error')).toHaveTextContent('32 to 512 printable ASCII');
    expect(save()).toBeDisabled();
    expect(document.body.textContent).not.toContain('too-short');
    await user.type(screen.getByLabelText(/^Token/), '-and-now-long-enough-1234567');
    expect(screen.queryByTestId('matter-credential-error')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('checks the CA certificate shape', async () => {
    const user = userEvent.setup();
    setup({ ...configuredSettings, caCertificate: null });
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await user.type(screen.getByLabelText(/^Token/), TOKEN);
    await user.type(screen.getByLabelText(/CA certificate/), 'garbage');
    expect(await screen.findByTestId('matter-ca-error')).toHaveTextContent('PEM certificates');
    expect(save()).toBeDisabled();
  });
});

describe('a stale form (ATT-1202)', () => {
  const changedElsewhere: ConnectionSettings = {
    ...configuredSettings,
    url: 'https://other-admin.example.com',
    updatedAt: '2026-11-07T09:00:00.000Z',
  };

  it('adopts settings another administrator saved while the form is untouched', async () => {
    const { update } = setup();
    expect(urlInput()).toHaveValue('https://matter.example.com');
    update(changedElsewhere);
    await waitFor(() => expect(urlInput()).toHaveValue('https://other-admin.example.com'));
    expect(screen.queryByTestId('matter-settings-stale')).not.toBeInTheDocument();
  });

  it('keeps edits, tells the user, blocks Save and offers a reload when settings changed under an open edit', async () => {
    const user = userEvent.setup();
    const { update, onSave } = setup();
    await user.type(urlInput(), '/mine');
    update(changedElsewhere);
    const notice = await screen.findByTestId('matter-settings-stale');
    expect(notice).toHaveTextContent(/Another administrator saved new connection settings/);
    expect(urlInput()).toHaveValue('https://matter.example.com/mine');
    expect(save()).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(within(notice).getByTestId('matter-settings-reload'));
    expect(urlInput()).toHaveValue('https://other-admin.example.com');
    expect(screen.queryByTestId('matter-settings-stale')).not.toBeInTheDocument();
  });

  it("is not stale just because the page already holds this form's own saved settings", async () => {
    const user = userEvent.setup();
    const saved = { ...configuredSettings, url: 'https://matter.example.com/', updatedAt: '2026-11-07T10:00:00.000Z' };
    let rerender: (settings: ConnectionSettings) => void = () => undefined;
    // Like the page: it adopts the saved settings first and answers a moment later.
    const onSave = vi.fn(async () => {
      rerender(saved);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return saved;
    });
    const view = render(<SettingsForm settings={configuredSettings} onSave={onSave} onRemove={vi.fn()} />);
    rerender = (settings) => view.rerender(<SettingsForm settings={settings} onSave={onSave} onRemove={vi.fn()} />);
    // Another spelling of the same URL is no endpoint change, so the token is not needed again.
    await user.type(urlInput(), '/');
    await user.click(save());
    expect(await screen.findByTestId('matter-saved-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('matter-settings-stale')).not.toBeInTheDocument();
    expect(urlInput()).toHaveValue('https://matter.example.com/');
  });
});

describe('clearing the CA certificate (ATT-1202)', () => {
  it('can be undone before saving', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();
    await user.click(screen.getByTestId('matter-clear-ca'));
    expect(screen.getByLabelText(/CA certificate/)).toBeDisabled();
    expect(screen.getByText(/will be removed when you save/)).toBeInTheDocument();
    await user.click(screen.getByTestId('matter-undo-clear-ca'));
    expect(screen.getByLabelText(/CA certificate/)).toBeEnabled();
    expect(screen.getByLabelText(/CA certificate/)).toHaveValue(configuredSettings.caCertificate);
    expect(screen.queryByTestId('matter-undo-clear-ca')).not.toBeInTheDocument();
    expect(screen.getByTestId('matter-clear-ca')).toBeInTheDocument();
    // Nothing changed, so nothing needs the token and nothing is sent about the CA.
    await user.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ url: 'https://matter.example.com' }));
  });
});

describe('focus after a dialog closes (ATT-1202)', () => {
  /** A promise the test settles, to keep a request pending while it moves the focus away. */
  function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  // While the request runs the focus may move away from the pressed button (the user clicks elsewhere, the button
  // re-renders); the dialog that opens afterwards would hand it back to wherever it is then. Moving it to the URL field
  // while the request is pending reproduces that: only the form's own focus handling brings it back to the button.
  const moveFocusAway = () => act(() => urlInput().focus());

  it('returns to Save after the success dialog', async () => {
    const user = userEvent.setup();
    const pending = deferred<ConnectionSettings>();
    render(<SettingsForm settings={configuredSettings} onSave={() => pending.promise} onRemove={vi.fn()} />);
    await user.type(urlInput(), '/');
    await user.click(save());
    moveFocusAway();
    await act(async () => pending.resolve(configuredSettings));
    const dialog = await screen.findByTestId('matter-saved-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(save()).toHaveFocus());
  });

  it('returns to Save after the error dialog of a failed save', async () => {
    const user = userEvent.setup();
    const pending = deferred<ConnectionSettings>();
    render(<SettingsForm settings={configuredSettings} onSave={() => pending.promise} onRemove={vi.fn()} />);
    await user.type(urlInput(), '/');
    await user.click(save());
    moveFocusAway();
    await act(async () => pending.reject(new Error('nope')));
    const dialog = await screen.findByTestId('matter-error-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(save()).toHaveFocus());
  });

  it('returns to Remove after the error dialog of a failed removal', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    render(<SettingsForm settings={configuredSettings} onSave={vi.fn()} onRemove={() => pending.promise} />);
    await user.click(screen.getByTestId('matter-remove'));
    const confirm = await screen.findByTestId('matter-remove-dialog');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    moveFocusAway();
    await act(async () => pending.reject(new Error('nope')));
    const dialog = await screen.findByTestId('matter-error-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByTestId('matter-remove')).toHaveFocus());
  });

  it('moves to the URL after a removal, since Remove is gone', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const onRemove = () => pending.promise;
    const view = render(<SettingsForm settings={configuredSettings} onSave={vi.fn()} onRemove={onRemove} />);
    await user.click(screen.getByTestId('matter-remove'));
    const confirm = await screen.findByTestId('matter-remove-dialog');
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    // The page reloads the (now empty) settings before the removal resolves.
    const removed: ConnectionSettings = {
      url: null,
      credentialConfigured: false,
      credentialUpdatedAt: null,
      caCertificate: null,
      updatedAt: null,
    };
    await act(async () => {
      view.rerender(<SettingsForm settings={removed} onSave={vi.fn()} onRemove={onRemove} />);
      pending.resolve();
    });
    await waitFor(() => expect(screen.queryByTestId('matter-remove')).not.toBeInTheDocument());
    await waitFor(() => expect(urlInput()).toHaveFocus());
  });

  it('returns to Remove when the removal is cancelled', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByTestId('matter-remove'));
    const dialog = await screen.findByTestId('matter-remove-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('matter-remove')).toHaveFocus());
  });
});
