import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
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

  it('refuses to save an empty required URL instead of round-tripping a 400', async () => {
    // `isRequired` and `type="url"` are native constraints; without the <Form> gate the save bar
    // would happily post `app.url: ''` and surface a generic API-error toast.
    render(<GeneralSection />);

    await userEvent.clear(urlField());
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('refuses to save a malformed URL', async () => {
    render(<GeneralSection />);

    await userEvent.clear(urlField());
    await userEvent.type(urlField(), 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('saves a valid edit', async () => {
    render(<GeneralSection />);

    await userEvent.type(urlField(), '/app');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: { app: { url: 'https://example.org/app', publicInternetUrl: undefined, licenseKey: undefined } },
    });
  });
});
