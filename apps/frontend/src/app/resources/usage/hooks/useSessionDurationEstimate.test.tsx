import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionDurationEstimate } from './useSessionDurationEstimate';

const state = vi.hoisted(() => ({
  resource: undefined as undefined | Record<string, unknown>,
}));

vi.mock('@attraccess/react-query-client', () => ({
  useGetOneResourceById: () => ({ data: state.resource }),
}));

const machine = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'machine',
  requireSessionDurationEstimate: true,
  maxSessionDurationMinutes: null,
  ...overrides,
});

let ask: () => Promise<number | null | undefined>;
function Harness() {
  const estimate = useSessionDurationEstimate(1);
  ask = estimate.ask;
  return estimate.dialog;
}

/** Starts an ask and records its answer once it settles. */
const startAsk = () => {
  const result: { value?: number | null; settled: boolean } = { settled: false };
  void act(() => {
    void ask().then((value) => {
      result.value = value;
      result.settled = true;
    });
  });
  return result;
};

const dialog = () => document.querySelector('[data-cy="session-duration-estimate-dialog"]');

beforeEach(() => {
  state.resource = machine();
});
afterEach(cleanup);

describe('useSessionDurationEstimate', () => {
  it.each([
    ['the machine does not require one', machine({ requireSessionDurationEstimate: false })],
    ['the resource is a door', machine({ type: 'door' })],
  ])('resolves undefined without asking when %s', async (_name, resource) => {
    state.resource = resource;
    render(<Harness />);
    await expect(ask()).resolves.toBeUndefined();
    expect(dialog()).toBeNull();
  });

  it('opens the dialog and resolves with the confirmed minutes', async () => {
    render(<Harness />);
    const result = startAsk();
    await screen.findByText('How long will you use this machine?');
    await userEvent.click(screen.getByRole('button', { name: '2h 0m' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(result.settled).toBe(true));
    expect(result.value).toBe(120);
  });

  it('resolves null when the dialog is cancelled', async () => {
    render(<Harness />);
    const result = startAsk();
    await screen.findByText('How long will you use this machine?');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(result.settled).toBe(true));
    expect(result.value).toBeNull();
  });

  it('resolves an earlier ask with null when a second one starts', async () => {
    render(<Harness />);
    const first = startAsk();
    await screen.findByText('How long will you use this machine?');
    const second = startAsk();
    await waitFor(() => expect(first.settled).toBe(true));
    expect(first.value).toBeNull();
    expect(second.settled).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(second.settled).toBe(true));
    expect(second.value).toBe(60);
  });

  it('resolves null when the caller unmounts while the dialog is open', async () => {
    const { unmount } = render(<Harness />);
    const result = startAsk();
    await screen.findByText('How long will you use this machine?');
    unmount();
    await waitFor(() => expect(result.settled).toBe(true));
    expect(result.value).toBeNull();
  });

  it('waits for the resource before asking when it is not loaded yet', async () => {
    state.resource = undefined;
    const { rerender } = render(<Harness />);
    const result = startAsk();
    expect(dialog()).toBeNull();
    expect(result.settled).toBe(false);

    state.resource = machine();
    rerender(<Harness />);
    await screen.findByText('How long will you use this machine?');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(result.settled).toBe(true));
    expect(result.value).toBe(60);
  });
});
