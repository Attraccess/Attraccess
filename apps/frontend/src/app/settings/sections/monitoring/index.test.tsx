import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  useDeleteMetricsApiKey,
  useGenerateMetricsApiKey,
  useGetMetricsSettings,
  useUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { MonitoringSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useGetMetricsSettings: vi.fn(),
  UseGetMetricsSettingsKeyFn: () => ['metrics'],
  useGenerateMetricsApiKey: vi.fn(),
  useDeleteMetricsApiKey: vi.fn(),
  useUpdateMetricsSettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
  }))()),
}));
const { setQueryData, invalidateQueries, success, error } = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries, setQueryData }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success, error }),
}));

interface UpdateMutationOptions {
  onSuccess: (data?: unknown) => void;
  onError: () => void;
}

/**
 * Two components use the update mutation (threshold and toggles). Every call gets its own `mutate`,
 * so a test picks the options of the one an interaction actually fired, not by render order.
 */
function trackUpdateMutations() {
  const mutations: Array<{ options: UpdateMutationOptions; mutate: Mock }> = [];
  vi.mocked(useUpdateMetricsSettings).mockImplementation((_mutationKey: unknown, options) => {
    const mutate = vi.fn();
    mutations.push({ options: options as UpdateMutationOptions, mutate });
    return { mutate, isPending: false } as unknown as ReturnType<typeof useUpdateMetricsSettings>;
  });
  return mutations;
}

const TOGGLES = { http: true, ws: false, cron: true, db: false, external: true, sse: false, flow: true };

describe('MonitoringSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 1 },
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);

    const idleMutation = { mutate: vi.fn(), isPending: false };
    vi.mocked(useGenerateMetricsApiKey).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useGenerateMetricsApiKey>,
    );
    vi.mocked(useDeleteMetricsApiKey).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useDeleteMetricsApiKey>,
    );
    vi.mocked(useUpdateMetricsSettings).mockReturnValue(
      idleMutation as unknown as ReturnType<typeof useUpdateMetricsSettings>,
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
    const updateMutations = trackUpdateMutations();

    const { container, rerender } = render(<MonitoringSection />);

    const input = screen.getByLabelText('slowQueryThreshold.label');
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    await userEvent.tab();
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));
    const thresholdMutation = updateMutations.find(({ mutate }) => mutate.mock.calls.length > 0);
    expect(thresholdMutation?.mutate).toHaveBeenCalledWith({ body: { slowQueryThresholdSeconds: 2 } });

    // The PATCH resolves with the authoritative post-write state.
    const afterSave = { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 2 };
    await act(async () => thresholdMutation?.options.onSuccess(afterSave));

    expect(setQueryData).toHaveBeenCalledWith(['metrics'], afterSave);
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();

    // Now somebody else moves it to 5 and a refetch brings that in.
    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 5 },
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);
    rerender(<MonitoringSection />);

    expect(screen.getByLabelText('slowQueryThreshold.label')).toHaveValue('5');
    expect(container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });
  it('shows generated keys and refreshes settings after generation, removal and toggle updates', async () => {
    const updateMutations = trackUpdateMutations();
    render(<MonitoringSection />);
    const generate = vi.mocked(useGenerateMetricsApiKey).mock.calls.at(-1)?.[1] as {
      onSuccess: (data: { apiKey: string }) => void;
    };
    const remove = vi.mocked(useDeleteMetricsApiKey).mock.calls.at(-1)?.[1] as { onSuccess: () => void };
    await userEvent.click(screen.getByRole('switch', { name: 'toggles.ws.label' }));
    const toggleMutation = updateMutations.find(({ mutate }) => mutate.mock.calls.length > 0);
    expect(toggleMutation?.mutate).toHaveBeenCalledWith({ body: { toggles: { ws: true } } });
    const toggle = toggleMutation?.options as UpdateMutationOptions;
    act(() => generate.onSuccess({ apiKey: 'generated-secret' }));
    expect(screen.getByDisplayValue('generated-secret')).toBeInTheDocument();
    expect(success).toHaveBeenLastCalledWith({ title: 'keyGenerated.title', description: 'keyGenerated.description' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['metrics'] });
    act(() => remove.onSuccess());
    expect(screen.queryByDisplayValue('generated-secret')).toBeNull();
    expect(success).toHaveBeenLastCalledWith({ title: 'keyRemoved.title', description: 'keyRemoved.description' });
    act(() => toggle.onSuccess());
    expect(success).toHaveBeenLastCalledWith({ title: 'toggles.savedTitle', description: 'toggles.savedDescription' });
    act(() => toggle.onError());
    expect(error).toHaveBeenLastCalledWith({ title: 'toggles.errorTitle', description: 'toggles.errorDescription' });
  });

  it('reads the metrics settings once, in the section, so the rows do not refetch them on mount', () => {
    render(<MonitoringSection />);

    expect(useGetMetricsSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps a freshly generated key when the refetch after Generate passes through loading', () => {
    // Settings that failed to load have no data, so the invalidation in Generate's onSuccess sends
    // the query back to loading: the spinner replaces the rows. The key is shown only once and
    // must still be there when they return.
    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);
    const { rerender } = render(<MonitoringSection />);
    const generate = vi.mocked(useGenerateMetricsApiKey).mock.calls.at(-1)?.[1] as {
      onSuccess: (data: { apiKey: string }) => void;
    };
    act(() => generate.onSuccess({ apiKey: 'one-time-secret' }));
    expect(screen.getByDisplayValue('one-time-secret')).toBeInTheDocument();

    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGetMetricsSettings>);
    rerender(<MonitoringSection />);
    expect(screen.queryByDisplayValue('one-time-secret')).toBeNull();

    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 1 },
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);
    rerender(<MonitoringSection />);

    expect(screen.getByDisplayValue('one-time-secret')).toBeInTheDocument();
  });

  it('keeps an unsaved threshold through a refetch that passes through loading', async () => {
    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);
    const { rerender } = render(<MonitoringSection />);
    await userEvent.type(screen.getByLabelText('slowQueryThreshold.label'), '3');
    await userEvent.tab();

    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGetMetricsSettings>);
    rerender(<MonitoringSection />);
    vi.mocked(useGetMetricsSettings).mockReturnValue({
      data: { apiKeyConfigured: true, toggles: TOGGLES, slowQueryThresholdSeconds: 1 },
      isLoading: false,
    } as ReturnType<typeof useGetMetricsSettings>);
    rerender(<MonitoringSection />);

    expect(screen.getByLabelText('slowQueryThreshold.label')).toHaveValue('3');
  });
});
