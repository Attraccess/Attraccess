import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
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
});
