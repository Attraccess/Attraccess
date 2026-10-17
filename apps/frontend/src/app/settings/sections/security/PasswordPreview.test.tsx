import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PasswordPolicyDto } from '@attraccess/react-query-client';
import { PasswordPreview } from './PasswordPreview';
const state = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  PasswordPolicyAdminService: { previewAdminPasswordPolicy: state.preview },
}));
const policy: PasswordPolicyDto = {
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
};
const t = (key: string) => key;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function pending() {
  let resolve: (result: { ok: boolean; errors: { code: string }[] }) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = Object.assign(
    new Promise<{ ok: boolean; errors: { code: string }[] }>((yes, no) => {
      resolve = yes;
      reject = no;
    }),
    { cancel: vi.fn() },
  );
  return { promise, resolve, reject };
}
async function type(value: string) {
  fireEvent.change(screen.getByLabelText('preview.passwordLabel'), { target: { value } });
  await act(async () => vi.advanceTimersByTime(400));
}
it('debounces the candidate, submits the unsaved policy and shows validation errors and visibility controls', async () => {
  const request = pending();
  state.preview.mockReturnValue(request.promise);
  render(<PasswordPreview policy={policy} t={t} />);
  const input = screen.getByLabelText('preview.passwordLabel');
  fireEvent.change(input, { target: { value: 'weak' } });
  expect(state.preview).not.toHaveBeenCalled();
  expect(screen.getByText('preview.loading')).toBeTruthy();
  await act(async () => vi.advanceTimersByTime(400));
  expect(state.preview).toHaveBeenCalledWith({ requestBody: { password: 'weak', draftPolicy: policy } });
  await act(async () => request.resolve({ ok: false, errors: [{ code: 'PASSWORD_TOO_SHORT' }] }));
  expect(screen.getByText('preview.fail')).toBeTruthy();
  expect(screen.getByText('preview.errors.PASSWORD_TOO_SHORT')).toBeTruthy();
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'preview.reveal' }));
  expect(input).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'preview.hide' }));
  expect(input).toHaveAttribute('type', 'password');
});
it('ignores an older response after a newer candidate passes and cancels on clear', async () => {
  const old = pending();
  const current = pending();
  state.preview.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<PasswordPreview policy={policy} t={t} />);
  await type('old');
  await type('Strong candidate 123!');
  expect(old.promise.cancel).toHaveBeenCalledOnce();
  await act(async () => current.resolve({ ok: true, errors: [] }));
  expect(screen.getByText('preview.pass')).toBeTruthy();
  expect(screen.getByText('preview.noErrors')).toBeTruthy();
  await act(async () => old.resolve({ ok: false, errors: [{ code: 'STALE' }] }));
  expect(screen.queryByText('preview.fail')).toBeNull();
  fireEvent.change(screen.getByLabelText('preview.passwordLabel'), { target: { value: '' } });
  expect(current.promise.cancel).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('policy-preview-result')).toBeNull();
  view.unmount();
  expect(current.promise.cancel).toHaveBeenCalledTimes(2);
});
it('settles a failed request without claiming the password passed', async () => {
  const request = pending();
  state.preview.mockReturnValue(request.promise);
  render(<PasswordPreview policy={policy} t={t} />);
  await type('candidate');
  await act(async () => request.reject(new Error('Offline')));
  expect(screen.queryByText('preview.loading')).toBeNull();
  expect(screen.queryByText('preview.pass')).toBeNull();
});
