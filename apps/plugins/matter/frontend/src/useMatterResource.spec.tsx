// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMatterResource } from './useMatterResource';

describe('useMatterResource', () => {
  it('loads once enabled, and never before: no request is sent that would be refused', async () => {
    const load = vi.fn(async () => 'data');
    const { result, rerender } = renderHook(({ enabled }) => useMatterResource(load, enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current.loading).toBe(false);
    expect(load).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe('data'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good data when a refetch fails, and reports the error', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('later failure'));
    const { result } = renderHook(() => useMatterResource(load));
    await waitFor(() => expect(result.current.data).toBe('first'));
    await act(async () => {
      expect(await result.current.refetch()).toBeNull();
    });
    expect(result.current.data).toBe('first');
    expect(result.current.error).toBe('later failure');
    expect(result.current.loading).toBe(false);
  });

  it('lets only the newest request update the state', async () => {
    const answers: ((value: string) => void)[] = [];
    const load = vi.fn(() => new Promise<string>((resolve) => answers.push(resolve)));
    const { result } = renderHook(() => useMatterResource(load));
    await waitFor(() => expect(answers).toHaveLength(1));
    act(() => void result.current.refetch());
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => answers[1]('new'));
    await act(async () => answers[0]('old'));
    expect(result.current.data).toBe('new');
  });

  it('reloads when the load function changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useMatterResource(() => Promise.resolve(id)), {
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.data).toBe('a'));
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.data).toBe('b'));
  });
});
