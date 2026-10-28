import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MassIntroductionEndReason,
  MassIntroductionLiveEventType,
  MassIntroductionReaderState,
  type MassIntroductionLiveEventDto,
  type MassIntroductionSessionDto,
} from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { AddPersonDrawer } from './AddPersonDrawer';
import { PeopleTarget } from './types';

const state = vi.hoisted(() => ({
  start: vi.fn(),
  startResult: null as unknown,
  startError: null as unknown,
  cancel: vi.fn(),
  get: vi.fn(),
  invalidate: vi.fn(),
  live: null as null | {
    topic: string;
    onUpdate: (event: MassIntroductionLiveEventDto) => void;
    onReconnect?: () => void;
  },
  readerCapabilities: undefined as unknown,
}));

vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useAccessControlServiceMassIntroductionStart: (options: {
    onSuccess: (data: unknown) => void;
    onError: (error: unknown) => void;
  }) => ({
    isPending: false,
    mutate: (variables: unknown) => {
      state.start(variables);
      if (state.startError) options.onError(state.startError);
      else options.onSuccess(state.startResult);
    },
  }),
  useAccessControlServiceMassIntroductionCancel: () => ({ mutate: state.cancel }),
  AccessControlService: { massIntroductionGet: (data: unknown) => state.get(data) },
}));
vi.mock('./usePeopleMutations', () => ({ useInvalidatePeopleIntroductions: () => state.invalidate }));
vi.mock('../../../utils/live-updates', () => ({
  useLiveUpdates: (props: NonNullable<typeof state.live>) => {
    state.live = props;
  },
}));
vi.mock('../../attractap/AttractapSelect', () => ({
  AttractapSelect: ({
    onSelectionChange,
    requiredCapabilities,
  }: {
    onSelectionChange: (id: number) => void;
    requiredCapabilities: unknown;
  }) => {
    state.readerCapabilities = requiredCapabilities;
    return <button onClick={() => onSelectionChange(4)}>Pick reader 4</button>;
  },
}));
// The individual tab's user picker is covered by AddPersonDrawer.test.tsx.
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  UserSearch: () => <p>User picker</p>,
}));
vi.mock('react-qrcode-logo', () => ({ QRCode: ({ value }: { value: string }) => <output>{value}</output> }));

function makeSession(overrides: Partial<MassIntroductionSessionDto> = {}): MassIntroductionSessionDto {
  const now = Date.now();
  return {
    id: 'session-1',
    token: 'tok-1',
    target: { type: 'resource', id: 7, name: 'Laser Cutter' } as MassIntroductionSessionDto['target'],
    reader: null,
    participants: [],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    ...overrides,
  };
}

const participant = (userId: number, username: string, extra: object = {}) =>
  ({
    userId,
    username,
    method: 'qr',
    alreadyIntroduced: false,
    joinedAt: new Date().toISOString(),
    ...extra,
  }) as MassIntroductionSessionDto['participants'][number];

const t = ((key: string) => key) as TFunction;

function renderDrawer(target: PeopleTarget = { type: 'resource', id: 7 }) {
  const onClose = vi.fn();
  const view = render(
    <AddPersonDrawer
      t={t}
      target={target}
      isOpen
      mode="introduction"
      comment=""
      isPending={false}
      onCommentChange={vi.fn()}
      onAdd={vi.fn()}
      onClose={onClose}
    />,
  );
  return { onClose, ...view };
}

/** Opens the drawer on its mass-introduction tab. */
function mount(target?: PeopleTarget) {
  const view = renderDrawer(target);
  fireEvent.click(screen.getByRole('tab', { name: 'addModal.tabs.mass' }));
  return view;
}

function startSession(session = makeSession()) {
  state.startResult = session;
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.startResult = makeSession();
  state.startError = null;
  state.live = null;
  state.readerCapabilities = undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('grant-introduction drawer', () => {
  it('opens on the individual tab and offers the mass introduction as a second tab', () => {
    renderDrawer();

    expect(screen.getByRole('tab', { name: 'addModal.tabs.individual' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('User picker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'addModal.submit' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'addModal.tabs.mass' }));

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'addModal.submit' })).toBeNull();
  });

  it('locks the individual tab while a QR code is running', () => {
    mount();
    startSession();

    expect(screen.getByRole('tab', { name: 'addModal.tabs.individual' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('starts without a reader and shows a QR code for the landing page', () => {
    mount();
    expect(state.live?.topic).toBe('mass-introduction');

    startSession();

    expect(state.start).toHaveBeenCalledWith({ requestBody: { resourceId: 7 } });
    expect(screen.getByText(`${window.location.origin}/resources/7?massIntroduction=tok-1`)).toBeInTheDocument();
    expect(screen.getByText('Introducing people to Laser Cutter')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '15:00');
    expect(screen.getByText('Nobody has joined yet.')).toBeInTheDocument();
    expect(screen.queryByText(/waiting for NFC cards/)).toBeNull();
  });

  it('requires a mass-introduction capable reader once the reader option is enabled', () => {
    mount({ type: 'group', id: 3 });

    fireEvent.click(screen.getByRole('switch', { name: /tap their NFC card/ }));
    expect(state.readerCapabilities).toEqual({ cardEnrollment: true });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

    fireEvent.click(screen.getByText('Pick reader 4'));
    startSession(makeSession({ reader: { id: 4, name: 'Lab reader', state: MassIntroductionReaderState.ACTIVE } }));

    expect(state.start).toHaveBeenCalledWith({ requestBody: { resourceGroupId: 3, readerId: 4 } });
    expect(screen.getByText('Lab reader is waiting for NFC cards')).toBeInTheDocument();
  });

  it('shows the API message when starting fails', () => {
    state.startError = { status: 409, message: 'Conflict', body: { message: 'The selected reader is busy' } };
    mount();

    startSession();

    expect(screen.getByText('The selected reader is busy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('renders participants and reader changes from live updates of its own session only', () => {
    mount();
    startSession();

    act(() =>
      state.live?.onUpdate({
        type: MassIntroductionLiveEventType.UPDATED,
        sessionId: 'other-session',
        session: makeSession({ id: 'other-session', participants: [participant(99, 'Stranger')] }),
      }),
    );
    expect(screen.queryByText('Stranger')).toBeNull();

    act(() =>
      state.live?.onUpdate({
        type: MassIntroductionLiveEventType.UPDATED,
        sessionId: 'session-1',
        session: makeSession({
          reader: { id: 4, name: 'Lab reader', state: MassIntroductionReaderState.DETACHED },
          participants: [participant(5, 'Bob'), participant(6, 'Carla', { method: 'nfc', alreadyIntroduced: true })],
        }),
      }),
    );

    expect(screen.getByText('Joined (2)')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carla')).toBeInTheDocument();
    expect(screen.getByText('NFC card')).toBeInTheDocument();
    expect(screen.getByText('Already introduced')).toBeInTheDocument();
    expect(screen.getByText(/Lab reader left the mass introduction/)).toBeInTheDocument();
    // The people table refreshes for every newly joined participant.
    expect(state.invalidate).toHaveBeenCalledWith(5);
    expect(state.invalidate).toHaveBeenCalledWith(6);
  });

  it('shows the ended state on an ended event and does not cancel again when closed', () => {
    const { onClose } = mount();
    startSession();

    act(() =>
      state.live?.onUpdate({
        type: MassIntroductionLiveEventType.ENDED,
        sessionId: 'session-1',
        session: null,
        reason: MassIntroductionEndReason.REVOKED,
      }),
    );

    expect(screen.getByText('Mass introduction ended')).toBeInTheDocument();
    expect(screen.getByText(/can no longer introduce people/)).toBeInTheDocument();
    expect(screen.queryByText(/massIntroduction=/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(state.cancel).not.toHaveBeenCalled();
  });

  it('ends when the countdown runs out', () => {
    vi.useFakeTimers();
    mount();
    const now = Date.now();
    startSession(
      makeSession({ createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 2000).toISOString() }),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '0:02');

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText('The 15 minutes are up. The QR code no longer works.')).toBeInTheDocument();
    expect(screen.queryByText(/massIntroduction=/)).toBeNull();
    expect(state.cancel).not.toHaveBeenCalled();
  });

  it('ends a running session and keeps its summary open until closed', () => {
    const { onClose } = mount();
    startSession();

    fireEvent.click(screen.getByRole('button', { name: 'End mass introduction' }));

    expect(state.cancel).toHaveBeenCalledTimes(1);
    expect(state.cancel).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(screen.getByText('The mass introduction was ended. The QR code no longer works.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'addModal.tabs.individual' })).not.toHaveAttribute('aria-disabled');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(state.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels a running session on unmount, but not one that never started', () => {
    const first = mount();
    first.unmount();
    expect(state.cancel).not.toHaveBeenCalled();

    const second = mount();
    startSession();
    second.unmount();
    expect(state.cancel).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });

  it('resyncs from the server after the live stream reconnects', async () => {
    mount();
    startSession();

    state.get.mockResolvedValueOnce(makeSession({ participants: [participant(8, 'Dana')] }));
    act(() => state.live?.onReconnect?.());
    expect(state.get).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(await screen.findByText('Dana')).toBeInTheDocument();

    state.get.mockRejectedValueOnce({ status: 404 });
    act(() => state.live?.onReconnect?.());
    await waitFor(() => expect(screen.getByText('Mass introduction ended')).toBeInTheDocument());
  });
});
