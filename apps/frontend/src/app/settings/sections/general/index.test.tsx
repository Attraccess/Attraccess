import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSettingsServiceGetSystemSettings,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { GeneralSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetSystemSettings: vi.fn(),
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  useSettingsServiceUpdateSystemSettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
const { setQueryData } = vi.hoisted(() => ({ setQueryData: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('../../../../components/CommunityLicenseButton', () => ({
  CommunityLicenseButton: () => <button type="button">community license</button>,
}));

const saveSettings = vi.fn();

describe('GeneralSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: '' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockReturnValue({
      mutate: saveSettings,
      isPending: false,
    } as unknown as ReturnType<typeof useSettingsServiceUpdateSystemSettings>);
  });

  const urlField = () => screen.getByLabelText('inputs.url.label');
  const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

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
      requestBody: { app: { url: 'https://example.org/app', publicInternetUrl: null, licenseKey: undefined } },
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
      requestBody: { app: { url: 'https://example.org', publicInternetUrl: null, licenseKey: undefined } },
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
        return { mutate: saveSettings, isPending: false } as unknown as ReturnType<
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
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { app: { url: 'https://example.org', publicInternetUrl: '' } },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockReturnValue({
      mutate: saveSettings,
      isPending: false,
    } as unknown as ReturnType<typeof useSettingsServiceUpdateSystemSettings>);
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
      requestBody: { app: { url: 'https://example.org/app', publicInternetUrl: null, licenseKey: undefined } },
    });
  });
});
