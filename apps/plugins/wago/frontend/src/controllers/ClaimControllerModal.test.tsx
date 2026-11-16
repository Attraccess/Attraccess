import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaimControllerModal } from './ClaimControllerModal';

const state = vi.hoisted(() => ({
  mutation: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null },
}));
vi.mock('../api/queries', () => ({
  useClaimControllerMutation: () => state.mutation,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.mutation.isPending = false;
  state.mutation.isError = false;
  state.mutation.error = null;
});
afterEach(cleanup);

function fill(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
}

it('submits the claim with the entered name and verifier and closes on success', async () => {
  state.mutation.mutate.mockImplementation((_variables, options) => options.onSuccess());
  const onOpenChange = vi.fn();
  render(<ClaimControllerModal controllerId={4} onOpenChange={onOpenChange} />);
  await screen.findByRole('dialog');
  fill('Controller name', 'Workshop CC100');
  fill('Physical pairing code or fingerprint', 'SHA256:pairing');
  fireEvent.click(screen.getByRole('button', { name: 'Verify and enroll' }));
  expect(state.mutation.mutate).toHaveBeenCalledWith(
    { id: 4, input: { name: 'Workshop CC100', verifier: 'SHA256:pairing' } },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
  expect(state.mutation.reset).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('closes and resets the entered values and mutation state on Cancel', async () => {
  const onOpenChange = vi.fn();
  const { rerender } = render(<ClaimControllerModal controllerId={4} onOpenChange={onOpenChange} />);
  await screen.findByRole('dialog');
  fill('Controller name', 'Workshop CC100');
  fill('Physical pairing code or fingerprint', 'SHA256:pairing');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.mutation.reset).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(state.mutation.mutate).not.toHaveBeenCalled();
  rerender(<ClaimControllerModal controllerId={5} onOpenChange={onOpenChange} />);
  expect((screen.getByRole('textbox', { name: 'Controller name' }) as HTMLInputElement).value).toBe('');
  expect(
    (screen.getByRole('textbox', { name: 'Physical pairing code or fingerprint' }) as HTMLInputElement).value,
  ).toBe('');
});

it('shows a claim error in a danger alert', async () => {
  state.mutation.isError = true;
  state.mutation.error = new Error('Pairing code rejected');
  render(<ClaimControllerModal controllerId={4} onOpenChange={vi.fn()} />);
  const message = await screen.findByText('Pairing code rejected');
  expect(message.closest('.alert--danger')).toBeTruthy();
});
