import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceHealthWarning } from './index';
const state = vi.hoisted(() => ({
  summary: undefined as
    | undefined
    | {
        isHealthy: boolean;
        unhealthyEntries: { id: number; identifier?: string; reason?: string; lastReportedAt: string }[];
      },
  canManage: false,
  mutate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: () => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (date: string) => date,
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceHealthServiceGetResourceHealthKey: 'health',
  useResourceHealthServiceGetResourceHealth: () => ({ data: state.summary }),
  useResourceMaintenancesServiceCanManageMaintenance: () => ({ data: { canManage: state.canManage } }),
  useResourceHealthServiceClearResourceHealthEntry: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.summary = undefined;
  state.canManage = false;
});
afterEach(cleanup);
it('hides warnings for missing and healthy summaries', () => {
  const view = render(<ResourceHealthWarning resourceId={7} />);
  expect(view.container).toBeEmptyDOMElement();
  view.unmount();
  state.summary = { isHealthy: true, unhealthyEntries: [] };
  expect(render(<ResourceHealthWarning resourceId={7} />).container).toBeEmptyDOMElement();
});
it('shows named and fallback failures without granting viewers a clear action', () => {
  state.summary = {
    isHealthy: false,
    unhealthyEntries: [
      { id: 1, identifier: 'Power', reason: 'Overload', lastReportedAt: '2026-09-01' },
      { id: 2, identifier: '', reason: '', lastReportedAt: '2026-09-02' },
    ],
  };
  render(<ResourceHealthWarning resourceId={7} />);
  for (const label of ['Power', 'Overload', '2026-09-01', 'alert.identifier.default', 'alert.reason.noReason'])
    expect(screen.getByText(label)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'actions.markHealthy' })).toBeNull();
});
it('clears the selected entry for maintenance managers and handles outcomes', () => {
  state.canManage = true;
  state.summary = { isHealthy: false, unhealthyEntries: [{ id: 42, lastReportedAt: '2026-09-01' }] };
  render(<ResourceHealthWarning resourceId={7} />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.markHealthy' }));
  expect(state.mutate).toHaveBeenCalledWith({ resourceId: 7, entryId: 42 });
  act(() => state.options.onError());
  expect(state.error).toHaveBeenCalledWith({ title: 'actions.markHealthyError' });
  expect(state.invalidate).not.toHaveBeenCalled();
  act(() => state.options.onSuccess());
  expect(state.success).toHaveBeenCalledWith({ title: 'actions.markHealthySuccess' });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['health'] });
});
