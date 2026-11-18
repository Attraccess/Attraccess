import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectUsageHistory } from '.';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  query: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useGetProjectUsageHistory: (...args: unknown[]) => {
    state.query(...args);
    return { data: { total: state.rows.length, data: state.rows } };
  },
}));
vi.mock('../../../../resources/usage/components/UsageNotesModal', () => ({
  UsageNotesModal: ({
    isOpen,
    onClose,
    resourceId,
    usageId,
  }: {
    isOpen: boolean;
    onClose: () => void;
    resourceId: number;
    usageId: number;
  }) =>
    isOpen ? (
      <div role="dialog">
        Resource {resourceId} session {usageId}
        <button onClick={onClose}>Close notes</button>
      </div>
    ) : null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [
    {
      id: 11,
      resourceId: 7,
      resource: { id: 7, name: 'Laser cutter' },
      user: { id: 3, username: 'Alice' },
      startTime: '2026-09-01T10:00:00Z',
      endTime: '2026-09-01T11:00:00Z',
      usageInMinutes: 60,
    },
    {
      id: 12,
      resourceId: 8,
      resource: { id: 8, name: '3D printer' },
      user: { id: 4, username: 'Bob' },
      startTime: '2026-09-02T10:00:00Z',
      endTime: null,
      usageInMinutes: -1,
    },
  ];
});
afterEach(cleanup);
const originalLanguage = useTranslationState.getState().language;
afterEach(() => useTranslationState.getState().setLanguage(originalLanguage));
const rowOf = (resourceName: string) => screen.getByText(resourceName).closest('tr') as HTMLElement;
it('loads the first page of the project history', () => {
  render(<ProjectUsageHistory projectId={5} />);
  expect(state.query).toHaveBeenCalledWith({ path: { id: 5 }, query: { page: 1, limit: 10 } });
  expect(screen.getByText('Laser cutter')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('opens the usage details of the clicked row and closes them again', async () => {
  render(<ProjectUsageHistory projectId={5} />);
  fireEvent.click(rowOf('Laser cutter'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Resource 7 session 11'));
  fireEvent.click(screen.getByText('Close notes'));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(rowOf('3D printer'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Resource 8 session 12'));
});
it('opens the usage details when Enter is pressed on a focused row', async () => {
  render(<ProjectUsageHistory projectId={5} />);
  const row = rowOf('Laser cutter');
  act(() => row.focus());
  fireEvent.keyDown(row, { key: 'Enter' });
  fireEvent.keyUp(row, { key: 'Enter' });
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Resource 7 session 11'));
});
it('translates the row texts when the language changes', () => {
  render(<ProjectUsageHistory projectId={5} />);
  expect(rowOf('3D printer')).toHaveTextContent('In progress');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(rowOf('3D printer')).toHaveTextContent('Läuft');
  expect(rowOf('Laser cutter')).toHaveTextContent('60 Min');
});
