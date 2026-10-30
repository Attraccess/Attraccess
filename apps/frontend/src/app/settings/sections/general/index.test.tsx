import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSettingsServiceGetResourceVisibilitySettings,
  useSettingsServiceGetSystemSettings,
  useSettingsServiceUpdateResourceVisibilitySettings,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { GeneralSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  ResourceActivityVisibility: { ALL: 'all', INTRODUCED: 'introduced' },
  useSettingsServiceGetSystemSettings: vi.fn(),
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  UseSettingsServiceGetSystemLanguageKeyFn: () => ['system-language'],
  useSettingsServiceUpdateSystemSettings: vi.fn(),
  useSettingsServiceGetResourceVisibilitySettings: vi.fn(),
  UseSettingsServiceGetResourceVisibilitySettingsKeyFn: () => ['visibility'],
  useSettingsServiceUpdateResourceVisibilitySettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
  }))()),
}));
const { setQueryData, toast } = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), apiError: vi.fn() },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => toast,
}));
vi.mock('../../../../components/CommunityLicenseButton', () => ({
  CommunityLicenseButton: ({ isDisabled }: { isDisabled: boolean }) => (
    <button type="button" disabled={isDisabled}>
      community license
    </button>
  ),
}));

const saveSettings = vi.fn();
const saveVisibility = vi.fn();

function mockVisibility(state: { data?: { activityVisibility: string }; isLoading?: boolean; isError?: boolean }) {
  vi.mocked(useSettingsServiceGetResourceVisibilitySettings).mockReturnValue({
    isLoading: false,
    isError: false,
    ...state,
  } as ReturnType<typeof useSettingsServiceGetResourceVisibilitySettings>);
}

function mockSaves() {
  saveSettings.mockResolvedValue({});
  saveVisibility.mockResolvedValue({});
  vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
    data: { app: { url: 'https://example.org', publicInternetUrl: '' } },
    isLoading: false,
  } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
  vi.mocked(useSettingsServiceUpdateSystemSettings).mockReturnValue({
    mutateAsync: saveSettings,
    isPending: false,
  } as unknown as ReturnType<typeof useSettingsServiceUpdateSystemSettings>);
  vi.mocked(useSettingsServiceUpdateResourceVisibilitySettings).mockReturnValue({
    mutateAsync: saveVisibility,
    isPending: false,
  } as unknown as ReturnType<typeof useSettingsServiceUpdateResourceVisibilitySettings>);
  mockVisibility({ data: { activityVisibility: 'all' } });
}

describe('GeneralSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaves();
  });

  const urlField = () => screen.getByLabelText('inputs.url.label');
  const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

  it('saves a language-only edit and protects it during refetches', async () => {
    const view = render(<GeneralSection />);
    await userEvent.click(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'English' }));
    expect(saveBar(view.container)).toBeInTheDocument();
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: '', defaultLanguage: 'de' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    view.rerender(<GeneralSection />);
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        app: {
          url: 'https://example.org',
          publicInternetUrl: null,
          licenseKey: undefined,
          defaultLanguage: 'en',
        },
      },
    });
    view.unmount();
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: '', defaultLanguage: 'en' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    const reloaded = render(<GeneralSection />);
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toHaveTextContent('English');
    expect(saveBar(reloaded.container)).toBeNull();
  });

  it('prevents edits during a pending save and preserves the draft after failure', async () => {
    let pending = false;
    let fail: (() => void) | undefined;
    saveSettings.mockReturnValue(
      new Promise((_, reject) => {
        fail = () => reject(new Error('failed'));
      }),
    );
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockImplementation(
      () =>
        ({ mutateAsync: saveSettings, isPending: pending }) as unknown as ReturnType<
          typeof useSettingsServiceUpdateSystemSettings
        >,
    );
    const view = render(<GeneralSection />);
    await userEvent.type(urlField(), '/submitted');
    await userEvent.type(screen.getByLabelText('inputs.licenseKey.label'), 'submitted-license');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    pending = true;
    view.rerender(<GeneralSection />);
    for (const name of ['inputs.url.label', 'inputs.publicInternetUrl.label', 'inputs.licenseKey.label']) {
      expect(screen.getByLabelText(name)).toBeDisabled();
      await userEvent.type(screen.getByLabelText(name), 'unsaved');
    }
    expect(screen.getByRole('button', { name: /inputs.defaultLanguage.label$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /inputs.activityVisibility.label$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'community license' })).toBeDisabled();
    expect(urlField()).toHaveValue('https://example.org/submitted');
    expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('submitted-license');
    await act(async () => fail?.());
    expect(toast.apiError).toHaveBeenCalledWith(expect.objectContaining({ error: new Error('failed') }));
    expect(toast.success).not.toHaveBeenCalled();
    pending = false;
    view.rerender(<GeneralSection />);
    expect(urlField()).toBeEnabled();
    expect(urlField()).toHaveValue('https://example.org/submitted');
    expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('submitted-license');
    await userEvent.type(urlField(), '/retry');
    expect(urlField()).toHaveValue('https://example.org/submitted/retry');
  });

  it('shows no save bar until something is edited', () => {
    const { container } = render(<GeneralSection />);

    expect(saveBar(container)).toBeNull();
  });

  it('shows the save bar after an edit and clears it on Discard', async () => {
    const { container } = render(<GeneralSection />);

    await userEvent.type(urlField(), '/changed');
    expect(saveBar(container)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));
    expect(saveBar(container)).toBeNull();
  });

  it('refuses to save an empty required URL, and says it is missing', async () => {
    // The visible message is asserted, not just the blocked mutation. Blocking alone would leave
    // the operator with a red box and no reason for it — and a mutation-only assertion passes
    // either way, so it would not pin the behaviour this test exists to guarantee.
    render(<GeneralSection />);

    await userEvent.clear(urlField());
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('inputs.url.errors.required')).toBeInTheDocument();
  });

  it('refuses to save a malformed URL, and distinguishes it from a missing one', async () => {
    render(<GeneralSection />);

    await userEvent.clear(urlField());
    await userEvent.type(urlField(), 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('inputs.url.errors.invalid')).toBeInTheDocument();
    expect(screen.queryByText('inputs.url.errors.required')).not.toBeInTheDocument();
  });

  it('rejects a malformed optional URL but accepts an empty one', async () => {
    render(<GeneralSection />);
    const publicField = screen.getByLabelText('inputs.publicInternetUrl.label');

    await userEvent.type(publicField, 'ftp://nope');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('inputs.publicInternetUrl.errors.invalid')).toBeInTheDocument();

    await userEvent.clear(publicField);
    await userEvent.type(urlField(), '/app');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    expect(saveSettings).toHaveBeenCalledOnce();
  });

  it('stays quiet until the first save attempt', async () => {
    // Flagging a half-typed URL red on every keystroke is noise, not help.
    render(<GeneralSection />);

    await userEvent.clear(urlField());

    expect(screen.queryByText('inputs.url.errors.required')).not.toBeInTheDocument();
  });

  it('saves a valid edit', async () => {
    render(<GeneralSection />);

    await userEvent.type(urlField(), '/app');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        app: {
          url: 'https://example.org/app',
          publicInternetUrl: null,
          licenseKey: undefined,
          defaultLanguage: 'de',
        },
      },
    });
  });

  it('sends null when the public URL is cleared, so the stored value is actually removed', async () => {
    // `undefined` is dropped by JSON.stringify and the API only writes the key when it is present,
    // so emptying the field used to be a no-op that still reported success — and the old value came
    // straight back a frame later when the response primed the cache.
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: 'https://public.example' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);

    render(<GeneralSection />);

    await userEvent.clear(screen.getByLabelText('inputs.publicInternetUrl.label'));
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        app: { url: 'https://example.org', publicInternetUrl: null, licenseKey: undefined, defaultLanguage: 'de' },
      },
    });
  });

  it('does not clobber an unsaved edit when a background refetch lands', async () => {
    // The old pattern seeded the draft from an effect keyed on the query result, so any refetch —
    // window focus, poll, another mutation's invalidation — reassigned the whole draft and threw
    // away whatever the operator had typed (ATT-868). The derived draft cannot do that: an edited
    // field is pinned until it is committed or discarded.
    const { rerender } = render(<GeneralSection />);

    await userEvent.type(urlField(), '/typing');

    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: '' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    rerender(<GeneralSection />);

    expect(urlField()).toHaveValue('https://example.org/typing');
  });

  it('releases the draft after a save, so a later server-side change is not a phantom edit', async () => {
    // The mirror image of the test above: pinned past the commit, the field would ignore the server
    // for the lifetime of the mount, and someone else's change would surface as an "unsaved
    // changes" bar the operator never caused, whose Save reverts them.
    let onSuccess: ((data: unknown) => void) | undefined;
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockImplementation(
      (options?: { onSuccess?: (data: unknown) => void }) => {
        onSuccess = options?.onSuccess;
        return { mutateAsync: saveSettings, isPending: false } as unknown as ReturnType<
          typeof useSettingsServiceUpdateSystemSettings
        >;
      },
    );

    const { container, rerender } = render(<GeneralSection />);

    await userEvent.type(urlField(), '/app');
    expect(saveBar(container)).toBeInTheDocument();

    const afterSave = { app: { url: 'https://example.org/app', publicInternetUrl: '' } };
    await act(async () => onSuccess?.(afterSave));

    expect(setQueryData).toHaveBeenCalledWith(['settings'], afterSave);
    expect(saveBar(container)).toBeNull();

    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://elsewhere.example', publicInternetUrl: '' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    rerender(<GeneralSection />);

    expect(urlField()).toHaveValue('https://elsewhere.example');
    expect(saveBar(container)).toBeNull();
  });
});

// Every test above drives the save-bar button. The form has a second, independent entry point —
// implicit submission — and it is the one that breaks silently: RAC's Form defaults to
// validationBehavior="native", so the browser's constraint check swallows the submit event before
// onSubmit runs, and react-aria suppresses the bubble it would otherwise show. The result is a
// keystroke that does nothing at all. Both cases below fail without validationBehavior="aria".
describe('GeneralSection — Enter key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaves();
  });

  it('reports an invalid URL rather than silently doing nothing', async () => {
    render(<GeneralSection />);
    const field = screen.getByLabelText('inputs.url.label');

    await userEvent.clear(field);
    await userEvent.type(field, '{Enter}');

    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('inputs.url.errors.required')).toBeInTheDocument();
  });

  it('submits a valid edit', async () => {
    render(<GeneralSection />);
    const field = screen.getByLabelText('inputs.url.label');

    await userEvent.type(field, '/app{Enter}');

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        app: {
          url: 'https://example.org/app',
          publicInternetUrl: null,
          licenseKey: undefined,
          defaultLanguage: 'de',
        },
      },
    });
  });
});

describe('GeneralSection — activity visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaves();
  });

  const visibilitySelect = () => screen.getByRole('button', { name: /inputs.activityVisibility.label$/ });
  const chooseIntroduced = async () => {
    await userEvent.click(visibilitySelect());
    await userEvent.click(await screen.findByRole('option', { name: 'inputs.activityVisibility.introduced' }));
  };
  const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

  it('keeps a change in the draft and saves only the visibility when only it changed', async () => {
    const { container } = render(<GeneralSection />);
    expect(screen.getByText('inputs.activityVisibility.description')).toBeInTheDocument();

    await chooseIntroduced();
    expect(saveVisibility).not.toHaveBeenCalled();
    expect(saveBar(container)).toBeInTheDocument();
    // The hint follows the selected, not yet saved, value.
    expect(screen.getByText('inputs.activityVisibility.introducedHint')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    expect(saveVisibility).toHaveBeenCalledWith({ requestBody: { activityVisibility: 'introduced' } });
    expect(saveSettings).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it('discards an unsaved visibility change', async () => {
    const { container } = render(<GeneralSection />);
    await chooseIntroduced();
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));
    expect(saveBar(container)).toBeNull();
    expect(screen.getByText('inputs.activityVisibility.description')).toBeInTheDocument();
  });

  it('saves both stores with one success toast and primes both caches', async () => {
    const options: { settings?: (data: unknown) => void; visibility?: (data: unknown) => void } = {};
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockImplementation((hookOptions) => {
      options.settings = hookOptions?.onSuccess as (data: unknown) => void;
      return { mutateAsync: saveSettings, isPending: false } as unknown as ReturnType<
        typeof useSettingsServiceUpdateSystemSettings
      >;
    });
    vi.mocked(useSettingsServiceUpdateResourceVisibilitySettings).mockImplementation((hookOptions) => {
      options.visibility = hookOptions?.onSuccess as (data: unknown) => void;
      return { mutateAsync: saveVisibility, isPending: false } as unknown as ReturnType<
        typeof useSettingsServiceUpdateResourceVisibilitySettings
      >;
    });
    const savedSettings = { app: { url: 'https://example.org/app', publicInternetUrl: '' } };
    const savedVisibility = { activityVisibility: 'introduced' };
    saveSettings.mockImplementation(async () => {
      options.settings?.(savedSettings);
      return savedSettings;
    });
    saveVisibility.mockImplementation(async () => {
      options.visibility?.(savedVisibility);
      return savedVisibility;
    });
    const { container } = render(<GeneralSection />);

    await userEvent.type(screen.getByLabelText('inputs.url.label'), '/app');
    await chooseIntroduced();
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledOnce();
    expect(saveVisibility).toHaveBeenCalledWith({ requestBody: { activityVisibility: 'introduced' } });
    expect(setQueryData).toHaveBeenCalledWith(['settings'], savedSettings);
    expect(setQueryData).toHaveBeenCalledWith(['visibility'], savedVisibility);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(saveBar(container)).toBeNull();
  });

  it('reports a failed visibility save and keeps it in the draft', async () => {
    saveVisibility.mockRejectedValue(new Error('forbidden'));
    const { container } = render(<GeneralSection />);
    await chooseIntroduced();
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    expect(toast.apiError).toHaveBeenCalledWith(expect.objectContaining({ error: new Error('forbidden') }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(saveBar(container)).toBeInTheDocument();
    expect(visibilitySelect()).toHaveTextContent('inputs.activityVisibility.introduced');
  });

  it('explains what "introduced only" hides when it is the saved mode', () => {
    mockVisibility({ data: { activityVisibility: 'introduced' } });
    render(<GeneralSection />);
    expect(screen.getByText('inputs.activityVisibility.introducedHint')).toBeInTheDocument();
  });

  it('disables only the visibility select while it loads or when it cannot be loaded', () => {
    mockVisibility({ isLoading: true });
    const view = render(<GeneralSection />);
    expect(visibilitySelect()).toBeDisabled();
    expect(screen.getByLabelText('inputs.url.label')).toBeEnabled();
    view.unmount();

    mockVisibility({ isError: true });
    render(<GeneralSection />);
    expect(screen.getByText('inputs.activityVisibility.loadFailed')).toBeInTheDocument();
    expect(visibilitySelect()).toBeDisabled();
    expect(screen.getByLabelText('inputs.url.label')).toBeEnabled();
  });
});
