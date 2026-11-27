import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { ActiveSessionDisplay } from '../ActiveSessionDisplay';
import { ParallelSessionsDisplay } from '../ParallelSessionsDisplay';

// The "Is the machine OK?" check in the end flows of the resource page, with the real hook and dialog.
const state = vi.hoisted(() => ({
  modules: ['maintenance'] as string[],
  canManage: false,
  setting: true,
  forms: vi.fn(),
  end: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), apiError: vi.fn(), error: vi.fn() },
  endOptions: [] as { onSuccess?: (data: unknown) => void }[],
  invalidate: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useGetLicenseInformation: () => ({ data: { modules: state.modules } }),
  useCanManageMaintenance: () => ({ data: { canManage: state.canManage } }),
  useGetOneResourceById: () => ({ data: { id: 5, askMaintenanceCheckOnSessionEnd: state.setting } }),
  useListMaintenanceRequestsKey: 'maintenance-requests',
  useResourceUsageEndSession: (_key: unknown, options: (typeof state.endOptions)[number]) => {
    state.endOptions.push(options);
    return { mutate: state.end, isPending: false };
  },
  useResourceUsageGetActiveSession: () => ({ data: { usages: [{ id: 22, userId: 1 }] } }),
  useResourceIntroducersGetNames: () => ({ data: [] }),
  useMessagingContactResourceHolder: () => ({ mutate: vi.fn(), isPending: false }),
  UseResourceUsageGetActiveSessionKeyFn: () => [],
  UseResourceUsageGetHistoryKeyFn: () => [],
  useGetNetworkRestrictionStatusKey: 'network-status',
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate, resetQueries: vi.fn() }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  AttraccessUser: () => null,
  DateTimeDisplay: () => null,
  useTranslations: () => ({ t: (key: string) => key, tExists: () => true }),
}));
vi.mock('../../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, hasPermission: () => true }),
}));
vi.mock('../../../../../hooks/useNetworkRestriction', () => ({
  useNetworkRestriction: () => ({ isRestricted: () => false }),
}));
vi.mock('../../../../../components/toastProvider', () => ({ useToastMessage: () => state.toast }));
vi.mock('../../../forms/hooks/useResourceFormsSubmission', () => ({
  useResourceFormsSubmission: () => ({ requestForms: state.forms, modal: null, clearFormsDraft: vi.fn() }),
}));
vi.mock('../SessionStatusCard', () => ({
  SessionStatusCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../SessionTimer', () => ({ SessionTimer: () => null }));
vi.mock('../SessionNotesModal', () => ({
  SessionModalMode: { END: 'end' },
  SessionNotesModal: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: (notes: string) => void }) =>
    isOpen ? <button onClick={() => onConfirm('some notes')}>Confirm notes</button> : null,
}));
vi.mock('../ActiveSessionDisplay/flowButtons', () => ({ FlowButtons: () => null }));
vi.mock('../../../../plugins/PluginSlot', () => ({ PluginSlot: () => null }));

const renderActive = () =>
  render(<ActiveSessionDisplay resourceId={5} usageId={22} startTime="2026-08-27T10:00:00.000Z" />);
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const question = () => screen.queryByRole('heading', { name: 'title' });
const endBody = () => state.end.mock.calls[0][0].body;

describe('"Is the machine OK?" before ending your own session', () => {
  beforeEach(() => {
    state.modules = ['maintenance'];
    state.canManage = false;
    state.setting = true;
    state.endOptions = [];
    state.forms = vi.fn().mockResolvedValue([]);
    state.end = vi.fn();
    state.invalidate.mockReset();
    Object.values(state.toast).forEach((toast) => toast.mockReset());
  });
  afterEach(cleanup);

  it('asks before any form and ends without a request when the machine is OK', async () => {
    renderActive();
    press('endSession');

    expect(await screen.findByRole('heading', { name: 'title' })).toBeInTheDocument();
    expect(state.forms).not.toHaveBeenCalled();
    press('machineOk');

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(state.forms).toHaveBeenCalledWith('end');
    expect(endBody()).toEqual({ usageId: 22, formSubmissions: [] });
    expect(question()).toBeNull();
  });

  it('requires a reason of three characters and sends it trimmed with the end call', async () => {
    renderActive();
    press('endSession');
    await screen.findByRole('heading', { name: 'title' });
    press('needsMaintenance');

    const reason = screen.getByRole('textbox', { name: /reasonLabel/ });
    fireEvent.change(reason, { target: { value: '  ab  ' } });
    expect(screen.getByRole('button', { name: 'continue' })).toBeDisabled();
    expect(state.forms).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: '  Blade is dull ' } });
    press('continue');

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(endBody()).toEqual({ usageId: 22, formSubmissions: [], maintenanceRequest: { reason: 'Blade is dull' } });
  });

  it('comes after the notes of "End with notes"', async () => {
    renderActive();
    // The icon-only trigger next to "End session" opens the menu with "End with notes".
    const trigger = document.querySelector('[aria-haspopup]') as HTMLElement;
    await userEvent.click(trigger);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'alternativeEndSessionOptionsMenu.endWithNotes.label' }),
    );
    press('Confirm notes');
    await screen.findByRole('heading', { name: 'title' });
    press('machineOk');

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(endBody()).toEqual({ usageId: 22, notes: 'some notes', formSubmissions: [] });
  });

  it('keeps the session running when the check is cancelled, also after choosing maintenance', async () => {
    renderActive();
    press('endSession');
    await screen.findByRole('heading', { name: 'title' });
    press('needsMaintenance');
    press('cancel');

    await waitFor(() => expect(question()).toBeNull());
    expect(state.forms).not.toHaveBeenCalled();
    expect(state.end).not.toHaveBeenCalled();
  });

  it('sends nothing when the end forms are cancelled after answering', async () => {
    state.forms = vi.fn().mockRejectedValue(new Error('user_cancelled_forms'));
    renderActive();
    press('endSession');
    await screen.findByRole('heading', { name: 'title' });
    press('machineOk');

    await waitFor(() => expect(state.forms).toHaveBeenCalled());
    expect(state.end).not.toHaveBeenCalled();
  });

  it.each([
    ['without the maintenance license', () => (state.modules = [])],
    ['for somebody who manages maintenance', () => (state.canManage = true)],
    ['when the resource does not ask', () => (state.setting = false)],
  ])('is skipped %s', async (_name, arrange) => {
    arrange();
    renderActive();
    press('endSession');

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(question()).toBeNull();
    expect(endBody()).toEqual({ usageId: 22, formSubmissions: [] });
  });

  it('confirms a filed request after the session ended, and warns when it was not filed', () => {
    renderActive();
    const ended = state.endOptions.at(-1);

    ended?.onSuccess?.({ maintenanceRequestFiled: true });
    expect(state.toast.success).toHaveBeenCalledWith({ title: 'filed.title', description: 'filed.description' });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['maintenance-requests'] });
    expect(state.toast.warning).not.toHaveBeenCalled();

    state.toast.success.mockReset();
    ended?.onSuccess?.({ maintenanceRequestFiled: false });
    expect(state.toast.warning).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'notFiled.title', description: 'notFiled.description' }),
    );
    expect(state.toast.success).toHaveBeenCalledTimes(1); // only "session ended"

    state.toast.success.mockReset();
    state.toast.warning.mockReset();
    ended?.onSuccess?.({});
    expect(state.toast.success).toHaveBeenCalledTimes(1);
    expect(state.toast.warning).not.toHaveBeenCalled();
  });

  const renderParallel = (userId: number) => {
    const usage = { id: 31, userId, startTime: '2026-09-01T12:00:00Z', user: { id: userId, username: 'x' } };
    render(
      <MemoryRouter>
        <ParallelSessionsDisplay
          resourceId={5}
          usages={[usage as unknown as ResourceUsage]}
          activeSessionCount={1}
          maxParallelSessions={3}
        />
      </MemoryRouter>,
    );
    press('endSession.ariaLabel');
    press('Confirm notes');
  };

  it('asks in the parallel session list when the session is your own', async () => {
    renderParallel(1);
    await screen.findByRole('heading', { name: 'title' });
    press('needsMaintenance');
    fireEvent.change(screen.getByRole('textbox', { name: /reasonLabel/ }), { target: { value: 'Smoke' } });
    press('continue');

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(endBody()).toEqual({
      usageId: 31,
      notes: 'some notes',
      formSubmissions: [],
      maintenanceRequest: { reason: 'Smoke' },
    });
  });

  it("never asks when ending somebody else's session", async () => {
    renderParallel(2);

    await waitFor(() => expect(state.end).toHaveBeenCalledTimes(1));
    expect(question()).toBeNull();
    expect(endBody()).toEqual({ usageId: 31, notes: 'some notes', formSubmissions: [] });
  });
});
