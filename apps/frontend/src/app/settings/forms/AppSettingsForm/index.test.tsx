import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppSettingsForm } from './index';
const state = vi.hoisted(() => ({
  settings: { app: {} as Record<string, unknown> },
  loading: false,
  save: vi.fn(),
  setup: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn: () => ['setup-status'],
  useSettingsServiceGetSystemSettings: () => ({ data: state.settings, isLoading: state.loading }),
  useSettingsServiceUpdateSystemSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.save };
  },
  useSettingsServiceApplyFirstTimeSetupSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.setup };
  },
}));
vi.mock('../../../../components/CommunityLicenseButton', () => ({ CommunityLicenseButton: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
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
      app: { url: 'https://app.example', publicInternetUrl: undefined, licenseKey: undefined, attractapLanguage: 'de' },
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
        attractapLanguage: 'de',
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
          attractapLanguage: 'en',
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
    expect(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ })).toHaveTextContent('Deutsch');
    german.unmount();

    Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'fr-CA' });
    render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
    expect(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ })).toHaveTextContent('English');
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
  fireEvent.click(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Deutsch' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).toHaveBeenCalledWith(
    expect.objectContaining({ requestBody: { app: expect.objectContaining({ attractapLanguage: 'de' }) } }),
  );
});
it('keeps an unsaved language choice during background refetches', async () => {
  const view = render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.click(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'English' }));
  state.settings = { app: { url: 'https://app.example', attractapLanguage: 'de' } };
  view.rerender(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ })).toHaveTextContent('English');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({ requestBody: { app: expect.objectContaining({ attractapLanguage: 'en' }) } }),
  );
});
it.each(['en-US', 'fr-CA', 'de-!!!', 'de-', 'de-u', 'de-1901-1901'])(
  'suggests English for setup browser locale %s',
  (locale) => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { configurable: true, value: locale });
    try {
      render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" />);
      expect(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ })).toHaveTextContent('English');
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
      expect(screen.getByRole('button', { name: /inputs.attractapLanguage.label$/ })).toHaveTextContent('Deutsch');
      fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
      expect(state.setup).toHaveBeenCalledWith(
        expect.objectContaining({ requestBody: { app: expect.objectContaining({ attractapLanguage: 'de' }) } }),
      );
    } finally {
      if (original) Object.defineProperty(window.navigator, 'language', original);
      else Reflect.deleteProperty(window.navigator, 'language');
    }
  },
);
