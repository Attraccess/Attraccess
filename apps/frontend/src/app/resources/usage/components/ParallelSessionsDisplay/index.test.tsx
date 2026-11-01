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
  contactPending: false,
  forms: vi.fn(),
  apiError: vi.fn(),
  endOptions: undefined as undefined | { onError?: (error: Error) => void },
}));

vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => state.update }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
  Button: ({
    children,
    onPress,
    isPending,
    isDisabled,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    isPending?: boolean;
    isDisabled?: boolean;
    'aria-label'?: string;
  }) => (
    <button onClick={onPress} aria-label={ariaLabel} aria-busy={!!isPending} disabled={!!isDisabled}>
      {children}
    </button>
  ),
  DateTimeDisplay: () => <span>time</span>,
  useTranslations: () => ({
    t: (key: string, params?: { count?: number; max?: number; name?: string }) =>
      params?.name ? `${key} ${params.name}` : params ? `${key} ${params.count}/${params.max}` : key,
    tExists: () => true,
  }),
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: state.apiError }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  // Introducers and maintainers of the resource; the current user is id 1.
  useAccessControlServiceResourceIntroducersGetNames: () => ({
    data: state.introducer ? [{ userId: 1, username: 'me', role: 'maintainer' }] : [],
  }),
  useResourcesServiceResourceUsageEndSession: (options: typeof state.endOptions) => {
    state.endOptions = options;
    return { mutate: state.end, isPending: false };
  },
  useMessagingServiceMessagingContactResourceHolder: () => ({ mutate: state.contact, isPending: state.contactPending }),
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: () => [],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: () => [],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.forms, modal: null, clearFormsDraft: vi.fn() }),
}));
vi.mock('../SessionStatusCard', () => ({
  SessionStatusCard: ({
    children,
    statusLabel,
    accent,
  }: {
    children: React.ReactNode;
    statusLabel: string;
    accent: string;
  }) => (
    <div data-testid="card" data-accent={accent}>
      <span>{statusLabel}</span>
      {children}
    </div>
  ),
}));
vi.mock('../SessionNotesModal', () => ({
  SessionModalMode: { END: 'end' },
  SessionNotesModal: ({ isOpen, onConfirm, description }: ComponentProps<typeof SessionNotesModal>) =>
    isOpen ? (
      <div>
        <p>{description}</p>
        <button onClick={() => onConfirm('done')}>Confirm notes</button>
      </div>
    ) : null,
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
    state.contactPending = false;
    state.forms.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('lists the other sessions with the in-use count', () => {
    mount();
    expect(screen.getByText('inUse 3/4')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('uses the warning accent while slots are free', () => {
    mount();
    expect(screen.getByTestId('card')).toHaveAttribute('data-accent', 'warning');
  });

  it('shows the full state with the danger accent', () => {
    mount(4, 4);
    expect(screen.getByText('full 4/4')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toHaveAttribute('data-accent', 'danger');
  });

  it('shows the full state when more sessions run than a lowered limit allows', () => {
    mount(3, 1);
    expect(screen.getByText('full 3/1')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toHaveAttribute('data-accent', 'danger');
  });

  it('names the person in the accessible label of each row action', () => {
    state.update = true;
    mount();
    expect(screen.getByRole('button', { name: 'endSession.ariaLabel Alex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'endSession.ariaLabel Sam' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'contact.ariaLabel Alex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'contact.ariaLabel Sam' })).toBeInTheDocument();
  });

  it('only offers End session for sessions the user is likely allowed to end', () => {
    mount();
    // not admin/introducer/maintainer: only the session I supervise
    expect(screen.getAllByRole('button', { name: /^endSession.ariaLabel/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'endSession.ariaLabel Sam' })).toBeInTheDocument();
    cleanup();
    state.update = true;
    mount();
    expect(screen.getAllByRole('button', { name: /^endSession.ariaLabel/ })).toHaveLength(2);
    cleanup();
    // introducers and maintainers may end any session, as the server allows
    state.update = false;
    state.introducer = true;
    mount();
    expect(screen.getAllByRole('button', { name: /^endSession.ariaLabel/ })).toHaveLength(2);
  });

  it('shows the server error when ending a session fails', () => {
    state.update = true;
    mount();
    const error = new Error('NoOwnActiveSessionError');
    state.endOptions?.onError?.(error);
    expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
  });

  it('ends the chosen session by usage id after confirmation', async () => {
    state.update = true;
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: /^endSession.ariaLabel/ })[0]);
    expect(screen.getByText('endSession.confirm Alex')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm notes' }));
    await waitFor(() =>
      expect(state.end).toHaveBeenCalledWith({
        resourceId: 7,
        requestBody: { usageId: 11, notes: 'done', formSubmissions: [] },
      }),
    );
  });

  it('contacts the chosen session user and shows the pending state on that row only', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'contact.ariaLabel Sam' }));
    expect(state.contact).toHaveBeenCalledWith({ resourceId: 7, userId: 3 });
    state.contactPending = true;
    view.rerender(
      <MemoryRouter>
        <ParallelSessionsDisplay resourceId={7} usages={usages} activeSessionCount={3} maxParallelSessions={4} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'contact.ariaLabel Sam' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'contact.ariaLabel Alex' })).toHaveAttribute('aria-busy', 'false');
  });
});
