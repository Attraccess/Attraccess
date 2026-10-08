import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setup } from './live-updates.test-fixture';

afterEach(cleanup);

describe('WAGO shared live queries', () => {
  it('transport failures retain data, cancel pending reads and recover without REST fallback', async () => {
    const { hook, queryClient, consumers, read } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () =>
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } })),
    );
    const neighborKey = ['wago', 'diagnostics', 2];
    queryClient.setQueryData(neighborKey, { revision: 10 });
    await act(async () => consumers.forEach((consumer) => consumer.unavailable?.()));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toEqual({ revision: 8 });
    expect(queryClient.getQueryState(neighborKey)?.status).toBe('success');
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () =>
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } })),
    );
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data).toEqual({ revision: 9 });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(['snapshot', 'unavailable'] as const)(
    'keeps a streamed %s authoritative when the initial REST read settles later',
    async (eventType) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const read = vi.fn(() => pending);
      const { hook, queryClient, queryKey, consumers } = setup(read);
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 8 } }));
      });
      await act(async () => resolve({ revision: 7 }));
      await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
      expect(queryClient.getQueryState(queryKey)?.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      expect(queryClient.getQueryData(queryKey)).toEqual(eventType === 'snapshot' ? { revision: 8 } : undefined);
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } }));
      });
      expect(queryClient.getQueryData(queryKey)).toEqual({ revision: 9 });
      await waitFor(() => expect(hook.result.current.data).toEqual({ revision: 9 }));
      expect(hook.result.current.isSuccess).toBe(true);
      hook.unmount();
      queryClient.clear();
    },
  );

  it('retains live revisions and unavailable state across a pending reconnect refresh', async () => {
    const { hook, queryClient, queryKey, consumers } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const otherKey = ['wago', 'diagnostics', 2];
    queryClient.setQueryData(otherKey, { revision: 3 });
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
    });
    const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const read = vi.fn(() => pending);
    let refresh!: Promise<void>;
    await act(async () => {
      queryClient.getQueryCache().find({ queryKey, exact: true })?.setOptions({ queryKey, queryFn: read });
      refresh = queryClient.invalidateQueries({ queryKey, exact: true });
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'unavailable' }));
      resolve({ revision: 7 });
      await refresh;
    });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.data).toEqual({ revision: 8 });
    expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } }));
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data).toEqual({ revision: 9 });
    hook.unmount();
    queryClient.clear();
  });

  it('lets the host refresh once on reconnect even with duplicate local consumers', async () => {
    const { hook, queryClient, consumers, read } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      // The host refresh runs before subscription-specific recovery callbacks.
      const refresh = queryClient.invalidateQueries();
      consumers.forEach((consumer) => consumer.reconnect?.());
      await refresh;
    });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
    expect(read).toHaveBeenCalledTimes(2);
    hook.unmount();
    queryClient.clear();
  });

  it('marks retained snapshots unavailable without REST reads, then restores success on recovery', async () => {
    const { hook, queryClient, queryKey, consumers, read } = setup();
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { source: 'live' } }));
    });
    const snapshotUpdatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
    const otherKey = ['wago', 'diagnostics', 2];
    queryClient.setQueryData(otherKey, { source: 'other-controller' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'unavailable' }));
      });
      await waitFor(() => expect(hook.result.current.isError).toBe(true));
      expect(queryClient.getQueryData(queryKey)).toEqual({ source: 'live' });
      expect(hook.result.current.data).toEqual({ source: 'live' });
      expect(hook.result.current.error).toEqual(new Error('Live updates are temporarily unavailable.'));
      expect(queryClient.getQueryState(queryKey)?.errorUpdatedAt).toBeGreaterThan(0);
      expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(snapshotUpdatedAt);
      expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
      expect(read).toHaveBeenCalledTimes(1);
    }
    await act(async () => {
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { source: 'recovered' } }));
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKey)).toEqual({ source: 'recovered' });
    expect(hook.result.current.error).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });
});
