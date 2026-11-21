import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFindManyKey, useGetCurrentKey, useGetOneUserByIdKey } from '@attraccess/react-query-client';
import { NameForm } from './name';
import { ChangeNameForm } from '../user-management/details/components/changeName';

const state = vi.hoisted(() => ({
  user: {
    id: 7,
    username: 'ada',
    firstName: 'Ada',
    lastName: null as string | null,
    authenticationDetails: [] as unknown[],
  },
  mutate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
}));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@attraccess/react-query-client')>();
  const mutation = (_key: unknown, options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate, isPending: false };
  };
  return {
    ...actual,
    useGetCurrent: () => ({ data: state.user }),
    useGetOneUserById: () => ({ data: state.user }),
    useChangeMyName: mutation,
    useChangeUserName: mutation,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  state.user.authenticationDetails = [];
});
afterEach(cleanup);

describe.each([
  { name: 'my name', admin: false, component: <NameForm /> },
  { name: 'user name', admin: true, component: <ChangeNameForm userId={7} /> },
])('$name', ({ component, admin }) => {
  it('saves trimmed names, sends a blank one as null and refreshes the user data', () => {
    render(component);
    expect(screen.getByRole('textbox', { name: 'firstName' })).toHaveValue('Ada');
    fireEvent.change(screen.getByRole('textbox', { name: 'firstName' }), { target: { value: '  Augusta ' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(state.mutate).toHaveBeenCalledWith({
      ...(admin ? { path: { id: 7 } } : {}),
      body: { firstName: 'Augusta', lastName: null },
    });
    act(() => state.options.onSuccess());
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: [useGetOneUserByIdKey] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: [useFindManyKey] });
    if (admin) expect(state.invalidate).toHaveBeenCalledWith({ queryKey: [useGetCurrentKey] });
    expect(state.success).toHaveBeenCalledWith({ title: 'updated' });
  });

  it('is read-only with a hint and no save button for an SSO user', () => {
    state.user.authenticationDetails = [{ providerId: 1, providerType: 'oidc', ssoSubject: 'abc' }];
    render(component);
    expect(screen.getByRole('textbox', { name: 'firstName' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'save' })).toBeNull();
    expect(screen.getByText(admin ? 'ssoManagedAdmin' : 'ssoManaged')).toBeTruthy();
  });

  it('shows the server message or the fallback on failure', () => {
    render(component);
    act(() => state.options.onError(new Error('x')));
    expect(state.error).toHaveBeenLastCalledWith({ title: 'updateFailed' });
  });
});
