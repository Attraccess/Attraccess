import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleOverridesModal } from './RoleOverridesModal';

vi.mock('@attraccess/react-query-client', () => ({
  PasswordPolicyRole: { ADMIN: 'admin' },
  UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn: () => ['overrides'],
  usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride: vi.fn(() => ({ mutate: upsert, isPending: false })),
  usePasswordPolicyAdminServiceDeletePasswordPolicyOverride: vi.fn(() => ({ mutate: remove, isPending: false })),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const { upsert, remove } = vi.hoisted(() => ({ upsert: vi.fn(), remove: vi.fn() }));

const GLOBAL_POLICY = {
  minLength: 12,
  maxLength: 64,
  minZxcvbnScore: 3,
  historySize: 5,
  rotationDays: 0,
  allowAllUnicode: true,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false,
  checkHIBP: true,
  checkCommonPasswords: true,
} as never;

const t = ((key: string) => key) as never;

// Only Switch.Content is interactive under HeroUI 3.2 (ATT-729), so the test-id wrapper is not the
// click target — the track inside it is. Same shape as labeledSwitch.test.tsx.
const toggle = (testId: string) =>
  fireEvent.click(screen.getByTestId(testId).querySelector('[data-slot="switch-control"]') as HTMLElement);

describe('RoleOverridesModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not discard in-progress toggles when the overrides list refetches', async () => {
    // The query client uses refetchOnWindowFocus with no staleTime, so `existing` gets a fresh
    // object identity on every focus. Seeding the whole draft from it in an effect meant tabbing
    // away mid-edit and back replaced twelve fields of work with the server row — the exact ATT-868
    // clobber the rest of this section removes.
    const existing = { role: 'admin', minLength: null } as never;

    const { rerender } = render(
      <RoleOverridesModal role={'admin' as never} existing={existing} globalPolicy={GLOBAL_POLICY} t={t} onClose={vi.fn()} />,
    );

    toggle('override-admin-minLength-toggle');
    expect(screen.getByTestId('override-admin-minLength-value')).toHaveValue('12');

    // Same data, new identity — what a refetch produces.
    rerender(
      <RoleOverridesModal
        role={'admin' as never}
        existing={{ role: 'admin', minLength: null } as never}
        globalPolicy={GLOBAL_POLICY}
        t={t}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('override-admin-minLength-value')).toHaveValue('12');
  });

  it('sends the stored value for fields the operator did not touch', async () => {
    const existing = { role: 'admin', minLength: 20, requireSpecial: null } as never;

    render(
      <RoleOverridesModal role={'admin' as never} existing={existing} globalPolicy={GLOBAL_POLICY} t={t} onClose={vi.fn()} />,
    );

    // minLength is already overridden at 20 and is left alone; only requireSpecial is turned on.
    expect(screen.getByTestId('override-admin-minLength-value')).toHaveValue('20');
    toggle('override-admin-requireSpecial-toggle');
    await userEvent.click(screen.getByTestId('policy-override-save'));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        requestBody: expect.objectContaining({ minLength: 20, requireSpecial: false }),
      }),
    );
  });

  it('removes the override when every field is turned back to inherit', async () => {
    const existing = { role: 'admin', minLength: 20 } as never;
    const onClose = vi.fn();

    render(
      <RoleOverridesModal role={'admin' as never} existing={existing} globalPolicy={GLOBAL_POLICY} t={t} onClose={onClose} />,
    );

    toggle('override-admin-minLength-toggle');
    await userEvent.click(screen.getByTestId('policy-override-save'));

    expect(remove).toHaveBeenCalledWith({ role: 'admin' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
