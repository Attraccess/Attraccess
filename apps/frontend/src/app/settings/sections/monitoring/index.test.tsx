import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSettingsServiceDeleteMetricsApiKey,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceGetMetricsSettings,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { MonitoringSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetMetricsSettings: vi.fn(),
  UseSettingsServiceGetMetricsSettingsKeyFn: () => ['metrics'],
  useSettingsServiceGenerateMetricsApiKey: vi.fn(),
  useSettingsServiceDeleteMetricsApiKey: vi.fn(),
  useSettingsServiceUpdateMetricsSettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));
const { setQueryData } = vi.hoisted(() => ({ setQueryData: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const TOGGLES = { http: true, ws: false, cron: true, db: false, external: true, sse: false, flow: true };

describe('MonitoringSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsServiceGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 1 },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetMetricsSettings>);

    const idleMutation = { mutate: vi.fn(), isPending: false };
    vi.mocked(useSettingsServiceGenerateMetricsApiKey).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useSettingsServiceGenerateMetricsApiKey>,
    );
    vi.mocked(useSettingsServiceDeleteMetricsApiKey).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useSettingsServiceDeleteMetricsApiKey>,
    );
    vi.mocked(useSettingsServiceUpdateMetricsSettings).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useSettingsServiceUpdateMetricsSettings>,
    );
  });

  it('renders exactly one row per subsystem toggle', () => {
    render(<MonitoringSection />);

    for (const subsystem of Object.keys(TOGGLES)) {
      expect(screen.getByTestId(`metrics-toggle-row-${subsystem}`)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^metrics-toggle-row-/)).toHaveLength(Object.keys(TOGGLES).length);
  });

  it('carries the endpoint and Prometheus snippet in the aside, not the content column', () => {
    const { container } = render(<MonitoringSection />);

    const aside = container.querySelector('[data-slot="settings-aside"]');
    expect(aside).toBeInTheDocument();
    expect(aside?.textContent).toContain('scrape_configs');
    expect(container.querySelector('[data-slot="settings-content"]')?.textContent).not.toContain('scrape_configs');
  });

  it('shows no save bar until the slow-query threshold is edited', () => {
    const { container } = render(<MonitoringSection />);

    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });

  it('keeps the save bar reachable when the threshold is cleared, and Discard restores the saved value', async () => {
    // Clearing a NumberField makes React Aria emit NaN. Treating that as "not dirty" unmounted the
    // whole save bar, stranding the operator with an empty field and no way back to the saved value.
    const { container } = render(<MonitoringSection />);

    const input = screen.getByLabelText('slowQueryThreshold.label');
    expect(input).toHaveValue('1');

    await userEvent.clear(input);
    await userEvent.tab(); // React Aria only commits the NaN on blur.

    expect(input).toHaveValue('');
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeInTheDocument();

    const discard = screen.getByRole('button', { name: 'saveBar.discard' });
    expect(discard).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'saveBar.save' })).toBeDisabled();

    await userEvent.click(discard);

    expect(screen.getByLabelText('slowQueryThreshold.label')).toHaveValue('1');
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });

  it('shows the saved threshold as the field value', () => {
    render(<MonitoringSection />);

    expect(screen.getByLabelText('slowQueryThreshold.label')).toHaveValue('1');
  });

  it('releases the draft after a save, so a later server-side change is not a phantom edit', async () => {
    // The draft has to win over the server while the operator is typing, but the pin must be
    // released once the value is committed. Held past the save, the field ignores the server for
    // the lifetime of the mount: someone else changing the threshold then shows up as an "unsaved
    // changes" bar the operator never caused, holding a stale value, whose Save reverts them.
    let onSuccess: ((data: unknown) => void) | undefined;
    vi.mocked(useSettingsServiceUpdateMetricsSettings).mockImplementation(
      (options?: { onSuccess?: (data: unknown) => void }) => {
        onSuccess = options?.onSuccess;
        return { mutate: vi.fn(), isPending: false } as unknown as ReturnType<
          typeof useSettingsServiceUpdateMetricsSettings
        >;
      },
    );

    const { container, rerender } = render(<MonitoringSection />);

    const input = screen.getByLabelText('slowQueryThreshold.label');
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    await userEvent.tab();
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeInTheDocument();

    // The PATCH resolves with the authoritative post-write state.
    const afterSave = { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 2 };
    await act(async () => onSuccess?.(afterSave));

    expect(setQueryData).toHaveBeenCalledWith(['metrics'], afterSave);
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();

    // Now somebody else moves it to 5 and a refetch brings that in.
    vi.mocked(useSettingsServiceGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 5 },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetMetricsSettings>);
    rerender(<MonitoringSection />);

    expect(screen.getByLabelText('slowQueryThreshold.label')).toHaveValue('5');
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });
});
