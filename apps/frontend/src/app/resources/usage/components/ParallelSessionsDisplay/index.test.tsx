import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { ParallelSessionsDisplay } from './index';
import type { SessionNotesModal } from '../SessionNotesModal';

const state = vi.hoisted(() => ({
  update: false,
  introducer: false,
  end: vi.fn(),
  contact: vi.fn(),
  forms: vi.fn(),
}));

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => state.update }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
  Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
  DateTimeDisplay: () => <span>time</span>,
  useTranslations: () => ({
    t: (key: string, params?: { count: number; max: number }) =>
      params ? `${key} ${params.count}/${params.max}` : key,
  }),
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useAccessControlServiceResourceIntroducersIsIntroducer: () => ({ data: { isIntroducer: state.introducer } }),
  useResourcesServiceResourceUsageEndSession: () => ({ mutate: state.end, isPending: false }),
  useMessagingServiceMessagingContactResourceHolder: () => ({ mutate: state.contact, isPending: false }),
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: () => [],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: () => [],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.forms, modal: null, clearFormsDraft: vi.fn() }),
}));
vi.mock('../SessionStatusCard', () => ({
  SessionStatusCard: ({ children, statusLabel }: { children: React.ReactNode; statusLabel: string }) => (
    <div>
      <span>{statusLabel}</span>
      {children}
    </div>
  ),
}));
vi.mock('../SessionNotesModal', () => ({
  SessionModalMode: { END: 'end' },
  SessionNotesModal: ({ isOpen, onConfirm }: ComponentProps<typeof SessionNotesModal>) =>
    isOpen ? <button onClick={() => onConfirm('done')}>Confirm notes</button> : null,
}));

const usages = [
  { id: 11, userId: 2, startTime: '2026-09-01T12:00:00Z', user: { id: 2, username: 'Alex' } },
  {
    id: 12,
    userId: 3,
    startTime: '2026-09-01T12:30:00Z',
    user: { id: 3, username: 'Sam' },
    supervisorUserId: 1,
    supervisorUser: { id: 1, username: 'Me' },
  },
] as unknown as ResourceUsage[];

function mount(count = 3, max = 4) {
  return render(
    <MemoryRouter>
      <ParallelSessionsDisplay resourceId={7} usages={usages} activeSessionCount={count} maxParallelSessions={max} />
    </MemoryRouter>,
  );
}

describe('ParallelSessionsDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.update = false;
    state.introducer = false;
    state.forms.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('lists the other sessions with the in-use count', () => {
    mount();
    expect(screen.getByText('inUse 3/4')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('shows the full state', () => {
    mount(4, 4);
    expect(screen.getByText('full 4/4')).toBeInTheDocument();
  });

  it('only offers End session for sessions the user is likely allowed to end', () => {
    mount();
    // not admin/introducer: only the session I supervise
    expect(screen.getAllByRole('button', { name: 'endSession.button' })).toHaveLength(1);
    cleanup();
    state.update = true;
    mount();
    expect(screen.getAllByRole('button', { name: 'endSession.button' })).toHaveLength(2);
  });

  it('ends the chosen session by usage id after confirmation', async () => {
    state.update = true;
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'endSession.button' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm notes' }));
    await waitFor(() =>
      expect(state.end).toHaveBeenCalledWith({
        resourceId: 7,
        requestBody: { usageId: 11, notes: 'done', formSubmissions: [] },
      }),
    );
  });

  it('contacts the chosen session user', () => {
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'contact.button' })[1]);
    expect(state.contact).toHaveBeenCalledWith({ resourceId: 7, userId: 3 });
  });
});
