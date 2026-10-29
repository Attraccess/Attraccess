import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppSettingsForm } from './index';
import userEvent from '@testing-library/user-event';
const state = vi.hoisted(() => ({
  settings: { app: {} as Record<string, unknown> },
  loading: false,
  pending: false,
  systemLanguage: { defaultLanguage: 'en' as 'en' | 'de', configured: false },
  save: vi.fn(),
  setup: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
  }))()),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  UseSettingsServiceGetSystemLanguageKeyFn: () => ['system-language'],
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn: () => ['setup-status'],
  useSettingsServiceGetSystemLanguage: () => ({ data: state.systemLanguage }),
  useSettingsServiceGetSystemSettings: () => ({ data: state.settings, isLoading: state.loading }),
  useSettingsServiceUpdateSystemSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.save, isPending: state.pending };
  },
  useSettingsServiceApplyFirstTimeSetupSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.setup, isPending: state.pending };
  },
}));
vi.mock('../../../../components/CommunityLicenseButton', () => ({ CommunityLicenseButton: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.pending = false;
  state.systemLanguage = { defaultLanguage: 'en', configured: false };
  state.settings = { app: { url: 'https://app.example', publicInternetUrl: 'https://public.example' } };
});
afterEach(cleanup);
it('loads existing URLs and preserves the stored license when the secret field is empty', () => {
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.url.label')).toHaveValue('https://app.example');
  fireEvent.change(screen.getByLabelText('inputs.publicInternetUrl.label'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith({
    requestBody: {
      app: { url: 'https://app.example', publicInternetUrl: undefined, licenseKey: undefined, defaultLanguage: 'de' },
    },
  });
});
it('submits a new license and clears it only after successful save', () => {
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.change(screen.getByLabelText('inputs.licenseKey.label'), { target: { value: ' new-license ' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith({
    requestBody: {
      app: {
        url: 'https://app.example',
        publicInternetUrl: 'https://public.example',
        licenseKey: 'new-license',
        defaultLanguage: 'de',
      },
    },
  });
  act(() => state.options.onError(new Error('failed')));
  expect(state.error).toHaveBeenCalled();
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue(' new-license ');
  act(() => state.options.onSuccess());
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('');
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
});
it('validates the wizard URL and advances after first-time setup succeeds', () => {
  const next = vi.fn();
  render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" onNext={next} />);
  expect(screen.queryByLabelText('inputs.licenseKey.label')).toBeNull();
  fireEvent.change(screen.getByLabelText('inputs.url.label'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('inputs.url.label'), { target: { value: 'https://configured.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).toHaveBeenCalledWith(
    expect.objectContaining({
      requestBody: {
        app: {
          url: 'https://configured.example',
          publicInternetUrl: window.location.origin,
          licenseKey: undefined,
          defaultLanguage: 'en',
        },
      },
    }),
  );
  expect(next).not.toHaveBeenCalled();
  act(() => state.options.onSuccess());
  expect(next).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['setup-status'] });
});
it('suggests German for a German setup browser locale and English for unsupported locales', () => {
  const language = Object.getOwnPropertyDescriptor(window.navigator, 'language');
  try {
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'de-AT' });
    const german = render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('Deutsch');
    german.unmount();

    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'fr-CA' });
    render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
  } finally {
    if (language) Object.defineProperty(window.navigator, 'language', language);
  }
});
it('shows loading state before settings arrive', () => {
  state.loading = true;
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByText('loading')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('submits an explicit setup choice from the HeroUI selector', async () => {
  render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
  fireEvent.click(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Deutsch' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).toHaveBeenCalledWith(
    expect.objectContaining({ requestBody: { app: expect.objectContaining({ defaultLanguage: 'de' }) } }),
  );
});
it('keeps an unsaved language choice during background refetches', async () => {
  const view = render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.click(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'English' }));
  state.settings = { app: { url: 'https://app.example', defaultLanguage: 'de' } };
  view.rerender(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({ requestBody: { app: expect.objectContaining({ defaultLanguage: 'en' }) } }),
  );
});
it('keeps all edited fields through refetch and a failed save, then accepts persisted values after success', async () => {
  const view = render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.change(screen.getByLabelText('inputs.url.label'), { target: { value: 'https://draft.example' } });
  fireEvent.change(screen.getByLabelText('inputs.publicInternetUrl.label'), {
    target: { value: 'https://draft-public.example' },
  });
  fireEvent.change(screen.getByLabelText('inputs.licenseKey.label'), { target: { value: 'draft-license' } });
  fireEvent.click(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'English' }));
  state.settings = {
    app: {
      url: 'https://refetched.example',
      publicInternetUrl: 'https://refetched-public.example',
      defaultLanguage: 'de',
    },
  };
  view.rerender(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenLastCalledWith({
    requestBody: {
      app: {
        url: 'https://draft.example',
        publicInternetUrl: 'https://draft-public.example',
        licenseKey: 'draft-license',
        defaultLanguage: 'en',
      },
    },
  });
  act(() => state.options.onError(new Error('failed')));
  state.settings = { app: { ...state.settings.app } };
  view.rerender(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.url.label')).toHaveValue('https://draft.example');
  expect(screen.getByLabelText('inputs.publicInternetUrl.label')).toHaveValue('https://draft-public.example');
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('draft-license');
  act(() => state.options.onSuccess());
  state.settings = {
    app: { url: 'https://saved.example', publicInternetUrl: 'https://saved-public.example', defaultLanguage: 'en' },
  };
  view.rerender(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.url.label')).toHaveValue('https://saved.example');
  expect(screen.getByLabelText('inputs.publicInternetUrl.label')).toHaveValue('https://saved-public.example');
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('');
});
it.each(['en-US', 'fr-CA', 'de-!!!', 'de-', 'de-u', 'de-1901-1901', 'de-u-12', 'de-t-12', 'de-u-ca-ca-12'])(
  'suggests English for setup browser locale %s',
  (locale) => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: locale });
    try {
      render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
      expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
    } finally {
      if (original) Object.defineProperty(window.navigator, 'language', original);
      else Reflect.deleteProperty(window.navigator, 'language');
    }
  },
);

it.each(['de-Latn-DE', 'de-DE-u-co-phonebk', 'de-CH-1901'])(
  'suggests and saves German for setup browser locale %s',
  (locale) => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: locale });
    try {
      render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
      expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('Deutsch');
      fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
      expect(state.setup).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { app: expect.objectContaining({ defaultLanguage: 'de' }) } }),
      );
    } finally {
      if (original) Object.defineProperty(window.navigator, 'language', original);
      else Reflect.deleteProperty(window.navigator, 'language');
    }
  },
);

it('reloads the saved system language when first-time setup is resumed', () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
  state.systemLanguage = { defaultLanguage: 'en', configured: true };
  render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
  expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
});

it.each(['settings', 'first-time-setup'] as const)(
  'prevents changes while %s is saving and restores editing after failure',
  async (endpoint) => {
    const variant = endpoint === 'settings' ? 'standalone' : 'wizard';
    const view = render(<AppSettingsForm variant={variant} endpoint={endpoint} />);
    const url = screen.getByLabelText('inputs.url.label');
    const publicUrl = screen.getByLabelText('inputs.publicInternetUrl.label');
    await userEvent.type(url, '/submitted');
    if (variant === 'standalone')
      await userEvent.type(screen.getByLabelText('inputs.licenseKey.label'), 'submitted-license');
    await userEvent.click(
      screen.getByRole('button', { name: variant === 'standalone' ? 'actions.save' : 'actions.next' }),
    );
    state.pending = true;
    view.rerender(<AppSettingsForm variant={variant} endpoint={endpoint} />);
    expect(url).toBeDisabled();
    expect(publicUrl).toBeDisabled();
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toBeDisabled();
    await userEvent.type(url, '/unsaved');
    expect(url).toHaveValue(
      variant === 'standalone' ? 'https://app.example/submitted' : window.location.origin + '/submitted',
    );
    if (variant === 'standalone') expect(screen.getByLabelText('inputs.licenseKey.label')).toBeDisabled();
    act(() => state.options.onError(new Error('failed')));
    state.pending = false;
    view.rerender(<AppSettingsForm variant={variant} endpoint={endpoint} />);
    expect(url).toBeEnabled();
    expect(publicUrl).toBeEnabled();
    if (variant === 'standalone')
      expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('submitted-license');
    await userEvent.type(url, '/retry');
    expect(url).toHaveValue(
      variant === 'standalone' ? 'https://app.example/submitted/retry' : window.location.origin + '/submitted/retry',
    );
  },
);
