import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import type { PasswordPolicyDto } from '@attraccess/react-query-client';
import { PasswordPreview } from './PasswordPreview';
const state = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  previewAdminPasswordPolicy: state.preview,
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key }),
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
let abort: MockInstance<AbortController['abort']>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  abort = vi.spyOn(AbortController.prototype, 'abort');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
type Result = { ok: boolean; errors: { code: string }[] };
/** One preview request: answers the next SDK call and remembers the abort signal it was sent with. */
function pending() {
  let resolve: (result: Result) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<{ data: Result }>((yes, no) => {
    resolve = (result) => yes({ data: result });
    reject = no;
  });
  const request = { promise, resolve, reject, signal: undefined as AbortSignal | undefined };
  state.preview.mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
    request.signal = signal;
    return promise;
  });
  return request;
}
/** How often the request was cancelled. */
const cancels = (request: { signal?: AbortSignal }) =>
  (abort.mock.contexts as AbortController[]).filter((controller) => controller.signal === request.signal).length;
async function type(value: string) {
  fireEvent.change(screen.getByLabelText('preview.passwordLabel'), { target: { value } });
  await act(async () => vi.advanceTimersByTime(400));
}
it('debounces the candidate, submits the unsaved policy and shows validation errors and visibility controls', async () => {
  const request = pending();
  render(<PasswordPreview policy={policy} />);
  const input = screen.getByLabelText('preview.passwordLabel');
  fireEvent.change(input, { target: { value: 'weak' } });
  expect(state.preview).not.toHaveBeenCalled();
  expect(screen.getByText('preview.loading')).toBeTruthy();
  await act(async () => vi.advanceTimersByTime(400));
  expect(state.preview).toHaveBeenCalledWith(
    expect.objectContaining({ body: { password: 'weak', draftPolicy: policy }, throwOnError: true }),
  );
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
  const view = render(<PasswordPreview policy={policy} />);
  await type('old');
  await type('Strong candidate 123!');
  expect(cancels(old)).toBe(1);
  await act(async () => current.resolve({ ok: true, errors: [] }));
  expect(screen.getByText('preview.pass')).toBeTruthy();
  expect(screen.getByText('preview.noErrors')).toBeTruthy();
  await act(async () => old.resolve({ ok: false, errors: [{ code: 'STALE' }] }));
  expect(screen.queryByText('preview.fail')).toBeNull();
  fireEvent.change(screen.getByLabelText('preview.passwordLabel'), { target: { value: '' } });
  expect(cancels(current)).toBe(1);
  expect(screen.queryByTestId('policy-preview-result')).toBeNull();
  view.unmount();
  expect(cancels(current)).toBe(2);
});
it('settles a failed request without claiming the password passed', async () => {
  const request = pending();
  render(<PasswordPreview policy={policy} />);
  await type('candidate');
  await act(async () => request.reject(new Error('Offline')));
  expect(screen.queryByText('preview.loading')).toBeNull();
  expect(screen.queryByText('preview.pass')).toBeNull();
});
