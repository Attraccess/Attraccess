import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OtherUserSessionDisplay } from './index';
import type { SessionNotesModal } from '../SessionNotesModal';
const state = vi.hoisted(() => ({
  session: {
    userId: 2,
    startTime: '2026-09-01T12:00:00Z',
    user: { id: 2, username: 'Alex' },
    supervisorUser: { id: 3, username: 'Supervisor' },
  } as unknown,
  update: true,
  introducer: false,
  canControl: false,
  allowTakeover: true,
  start: vi.fn(),
  end: vi.fn(),
  contact: vi.fn(),
  forms: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  invalidate: vi.fn(),
  callbacks: {} as Record<
    string,
    { onSuccess: (data: { conversationId: number }) => void; onError?: (error: Error) => void }
  >,
}));
vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => state.update }),
}));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceUsageGetActiveSession: () => ({ data: { usage: state.session } }),
  useResourcesServiceResourceUsageCanControl: () => ({ data: { canControl: state.canControl } }),
  useAccessControlServiceResourceIntroducersIsIntroducer: () => ({ data: { isIntroducer: state.introducer } }),
  useResourcesServiceGetOneResourceById: () => ({ data: { allowTakeOver: state.allowTakeover } }),
  useResourcesServiceResourceUsageStartSession: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.start = options;
    return { mutate: state.start, isPending: false };
  },
  useResourcesServiceResourceUsageEndSession: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.end = options;
    return { mutate: state.end, isPending: false };
  },
  useMessagingServiceMessagingContactResourceHolder: (options: (typeof state.callbacks)[string]) => {
    state.callbacks.contact = options;
    return { mutate: state.contact, isPending: false };
  },
  UseResourcesServiceResourceUsageGetActiveSessionKeyFn: (params: unknown) => ['active', params],
  UseResourcesServiceResourceUsageGetHistoryKeyFn: (params: unknown) => ['history', params],
}));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.forms, modal: null }),
}));
vi.mock('../SessionNotesModal', () => ({
  SessionModalMode: { START: 'start', END: 'end' },
  SessionNotesModal: ({ isOpen, onConfirm, onClose, mode }: ComponentProps<typeof SessionNotesModal>) =>
    isOpen ? (
      <section aria-label={`${mode} notes`}>
        <button onClick={() => onConfirm('Operator note')}>Confirm notes</button>
        <button onClick={onClose}>Cancel notes</button>
      </section>
    ) : null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.callbacks = {};
  state.session = {
    userId: 2,
    startTime: '2026-09-01T12:00:00Z',
    user: { id: 2, username: 'Alex' },
    supervisorUser: { id: 3, username: 'Supervisor' },
  };
  state.update = true;
  state.introducer = false;
  state.canControl = false;
  state.allowTakeover = true;
  state.forms.mockReset().mockResolvedValue([{ formId: 7, data: { ack: true } }]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<OtherUserSessionDisplay resourceId={7} />} />
        <Route path="/messages" element={<p>Conversation opened</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('shows the holder and supervisor and sends scoped takeover and stop submissions', async () => {
  mount();
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(screen.getByText('Supervisor')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Takeover Resource' }));
  await waitFor(() =>
    expect(state.start).toHaveBeenCalledWith({
      resourceId: 7,
      requestBody: { forceTakeOver: true, formSubmissions: [{ formId: 7, data: { ack: true } }] },
    }),
  );
  expect(state.forms).toHaveBeenCalledWith('takeover');
  fireEvent.click(screen.getByRole('button', { name: 'Stop Other User Session' }));
  await waitFor(() =>
    expect(state.end).toHaveBeenCalledWith({
      resourceId: 7,
      requestBody: { formSubmissions: [{ formId: 7, data: { ack: true } }] },
    }),
  );
  expect(state.forms).toHaveBeenCalledWith('end');
  for (const action of ['start', 'end']) act(() => state.callbacks[action].onSuccess({ conversationId: 0 }));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['active', { resourceId: 7 }] });
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Takeover Successful' }));
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Other User Session Stopped' }));
  const historyInvalidations = state.invalidate.mock.calls.filter(([options]) => options.predicate);
  expect(historyInvalidations).toHaveLength(2);
  for (const [options] of historyInvalidations) {
    expect(options.predicate({ queryKey: ['history', { resourceId: 7, page: 2 }] })).toBe(true);
    expect(options.predicate({ queryKey: ['history', { resourceId: 8 }] })).toBe(false);
    expect(options.predicate({ queryKey: ['other', { resourceId: 7 }] })).toBe(false);
    expect(options.predicate({ queryKey: ['history'] })).toBe(false);
  }
});
it('collects optional notes and allows cancelling without a mutation', async () => {
  mount();
  const triggers = () => document.querySelectorAll('button[aria-haspopup="true"]');
  fireEvent.click(triggers()[0]);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Takeover with Notes' }));
  fireEvent.click(screen.getByText('Cancel notes'));
  expect(state.start).not.toHaveBeenCalled();
  fireEvent.click(triggers()[0]);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Takeover with Notes' }));
  fireEvent.click(screen.getByText('Confirm notes'));
  await waitFor(() =>
    expect(state.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ notes: 'Operator note', forceTakeOver: true }),
      }),
    ),
  );
  act(() => state.callbacks.start.onSuccess({ conversationId: 0 }));
  expect(screen.queryByRole('region')).toBeNull();
  fireEvent.click(triggers()[1]);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Stop other user session with Notes' }));
  fireEvent.click(screen.getByText('Confirm notes'));
  await waitFor(() =>
    expect(state.end).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: expect.objectContaining({ notes: 'Operator note' }) }),
    ),
  );
});
it('keeps cancelled forms from starting or stopping sessions and reports failed contact/takeover', async () => {
  state.forms.mockRejectedValue(new Error('user_cancelled_forms'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Takeover Resource' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop Other User Session' }));
  await waitFor(() => expect(state.forms).toHaveBeenCalledTimes(2));
  expect(state.start).not.toHaveBeenCalled();
  expect(state.end).not.toHaveBeenCalled();
  act(() => state.callbacks.start.onError?.(new Error('Forbidden')));
  act(() => state.callbacks.contact.onError?.(new Error('Unavailable')));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Takeover Failed' }));
  expect(state.error).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not contact user' }));
  fireEvent.click(screen.getByRole('button', { name: 'Contact current user' }));
  expect(state.contact).toHaveBeenCalledWith({ resourceId: 7 });
  act(() => state.callbacks.contact.onSuccess({ conversationId: 10 }));
  expect(screen.getByText('Conversation opened')).toBeTruthy();
});
it('enforces distinct takeover and stop permissions and hides own or absent sessions', () => {
  state.update = false;
  state.canControl = true;
  let view = mount();
  expect(screen.getByRole('button', { name: 'Takeover Resource' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Stop Other User Session' })).toBeNull();
  view.unmount();
  state.allowTakeover = false;
  state.introducer = true;
  view = mount();
  expect(screen.queryByRole('button', { name: 'Takeover Resource' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Stop Other User Session' })).toBeTruthy();
  view.unmount();
  state.session = { userId: 1 };
  view = mount();
  expect(screen.queryByText('In use')).toBeNull();
  view.unmount();
  state.session = undefined;
  mount();
  expect(screen.queryByText('In use')).toBeNull();
});
