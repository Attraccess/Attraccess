import type { ResourceUsage } from '@attraccess/react-query-client';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UsageNotesModal } from './index';
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useProjectsServiceFindManyProjects: () => ({
    data: {
      data: [
        { id: 7, name: 'Workshop' },
        { id: 8, name: 'Research' },
      ],
    },
  }),
}));
afterEach(cleanup);
const session = {
  id: 1,
  userId: 1,
  startTime: '2026-09-01T10:00:00Z',
  endTime: '2026-09-01T11:00:00Z',
  usageAction: 'usage',
  startNotes: 'Start note',
  endNotes: 'End note',
  project: { id: 7, name: 'Workshop' },
} as ResourceUsage;
it('lets owners reassign completed sessions and forwards close', async () => {
  const change = vi.fn(),
    close = vi.fn();
  render(
    <UsageNotesModal
      isOpen
      onClose={close}
      session={session}
      projectLabel="Project"
      projectPlaceholder="Unassigned"
      resolveProjectId={() => 7}
      onProjectChange={change}
      operatingDurationMs={60000}
    />,
  );
  expect(screen.getByText('Machine running time during this session')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Workshop/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'Research' }));
  expect(change).toHaveBeenCalledWith(session, 8);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalled();
});
it('shows read-only project attribution for another user or an ongoing session', () => {
  const view = render(
    <UsageNotesModal
      isOpen
      onClose={vi.fn()}
      session={{ ...session, userId: 2 }}
      projectLabel="Project"
      projectPlaceholder="Unassigned"
      resolveProjectId={() => 7}
      onProjectChange={vi.fn()}
    />,
  );
  expect(screen.getByText('Workshop')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Workshop/ })).toBeNull();
  view.unmount();
  render(
    <UsageNotesModal
      isOpen
      onClose={vi.fn()}
      session={{ ...session, endTime: null, project: null, startNotes: ' ' }}
      projectLabel="Project"
      projectPlaceholder="Unassigned"
    />,
  );
  expect(screen.getByText('Unassigned')).toBeTruthy();
  expect(screen.getByText('No notes provided')).toBeTruthy();
  expect(screen.queryByText('End Notes')).toBeNull();
});
it('renders historical form values including booleans, numbers, selects and text', async () => {
  const fields = [
    ['Accepted', 'boolean', 'true'],
    ['Declined', 'boolean', 'false'],
    ['Count', 'number', '3'],
    ['Material', 'select', 'PLA'],
    ['Comment', 'text', 'All clear'],
  ];
  const forms = [
    {
      id: 10,
      formId: 20,
      form: null,
      data: Object.fromEntries(
        fields.map(([name, type, value], index) => [index, { value, fieldDefinition: { name, type } }]),
      ),
    },
    { id: 11, formId: 21, data: {} },
  ];
  render(
    <UsageNotesModal isOpen onClose={vi.fn()} session={{ ...session, formSubmissions: forms } as ResourceUsage} />,
  );
  for (const text of ['Form #20', 'Yes', 'No', '3', 'PLA', 'All clear'])
    expect(await screen.findByText(text)).toBeTruthy();
  expect(screen.queryByText('Form #21')).toBeNull();
});
it('renders loading until the session arrives and nothing while closed', () => {
  const view = render(<UsageNotesModal isOpen onClose={vi.fn()} session={null} />);
  expect(document.querySelector('.spinner')).toBeTruthy();
  view.unmount();
  render(<UsageNotesModal isOpen={false} onClose={vi.fn()} session={session} />);
  expect(screen.queryByText('Session Notes')).toBeNull();
});
