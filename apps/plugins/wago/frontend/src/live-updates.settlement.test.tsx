import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setup } from './live-updates.test-fixture';

afterEach(cleanup);

describe('WAGO REST settlement ordering', () => {
  it.each([false, true])(
    'retains the latest snapshot when unavailable interleaves with a REST commit (reconnect=%s)',
    async (reconnect) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const { hook, queryClient, queryKey, consumers } = setup(reconnect ? undefined : () => pending);
      if (reconnect) {
        await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
        await act(async () => {
          consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 6 } }));
        });
        const query = queryClient.getQueryCache().find({ queryKey, exact: true });
        if (!query) throw new Error('Missing live query');
        await act(async () => {
          void query.fetch({ ...query.options, queryFn: () => pending });
        });
      }
      await waitFor(() => expect(consumers.size).toBe(2));
      let updatedAt: number | undefined;
      await act(async () => {
        resolve({ revision: 7 });
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
        updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
        // The older REST result commits before the snapshot's deferred restoration.
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType: 'unavailable' }));
      });
      await waitFor(() => expect(hook.result.current.isError).toBe(true));
      expect(hook.result.current.data).toEqual({ revision: 8 });
      expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(updatedAt);
      expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 9 } }));
      });
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
      expect(hook.result.current.data).toEqual({ revision: 9 });
      hook.unmount();
      queryClient.clear();
    },
  );

  it.each(['snapshot', 'unavailable'] as const)(
    'preserves %s between retryer settlement and cache commit',
    async (eventType) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const { hook, queryClient, queryKey, consumers } = setup(() => pending);
      await waitFor(() => expect(consumers.size).toBe(2));
      await act(async () => {
        resolve({ revision: 7 });
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 8 } }));
      });
      await waitFor(() => expect(hook.result.current.isFetching).toBe(false));
      const state = queryClient.getQueryState(queryKey);
      hook.unmount();
      queryClient.clear();
      expect(state?.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      expect(state?.data).toEqual(eventType === 'snapshot' ? { revision: 8 } : undefined);
    },
  );

  it.each(['snapshot', 'unavailable'] as const)(
    'retains the latest snapshot during a settled reconnect read followed by %s',
    async (eventType) => {
      const { hook, queryClient, queryKey, consumers } = setup();
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
      await act(async () => {
        consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
      });
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!query) throw new Error('Missing live query');
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      let refresh!: Promise<unknown>;
      await act(async () => {
        refresh = query.fetch({ ...query.options, queryFn: () => pending });
      });
      await act(async () => {
        resolve({ revision: 7 });
        await Promise.resolve();
        consumers.forEach((consumer) => consumer.update({ eventType, value: { revision: 9 } }));
        await refresh;
      });
      expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
      expect(queryClient.getQueryData(queryKey)).toEqual({ revision: eventType === 'snapshot' ? 9 : 8 });
      await waitFor(() => expect(hook.result.current.data).toEqual({ revision: eventType === 'snapshot' ? 9 : 8 }));
      expect(hook.result.current.status).toBe(eventType === 'snapshot' ? 'success' : 'error');
      if (eventType === 'unavailable') expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(updatedAt);
      hook.unmount();
      queryClient.clear();
    },
  );

  it.each([
    ['snapshot', 'snapshot'],
    ['snapshot', 'unavailable'],
    ['unavailable', 'snapshot'],
  ] as const)('keeps the later %s/%s event across duplicate consumers', async (first, last) => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { hook, queryClient, queryKey, consumers } = setup(() => pending);
    await waitFor(() => expect(consumers.size).toBe(2));
    await act(async () => {
      resolve({ revision: 7 });
      await Promise.resolve();
      consumers.forEach((consumer) => consumer.update({ eventType: first, value: { revision: 8 } }));
      consumers.forEach((consumer) => consumer.update({ eventType: last, value: { revision: 9 } }));
    });
    expect(queryClient.getQueryState(queryKey)?.status).toBe(last === 'snapshot' ? 'success' : 'error');
    expect(queryClient.getQueryData(queryKey)).toEqual({ revision: last === 'snapshot' ? 9 : 8 });
    expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
    hook.unmount();
    queryClient.clear();
  });

  it('does not restore old live state into a replacement cache query', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { hook, queryClient, queryKey, consumers } = setup(() => pending);
    await waitFor(() => expect(consumers.size).toBe(2));
    await act(async () => {
      resolve({ revision: 7 });
      await Promise.resolve();
      consumers.forEach((consumer) => consumer.update({ eventType: 'snapshot', value: { revision: 8 } }));
      hook.unmount();
      queryClient.clear();
      queryClient.setQueryData(queryKey, { revision: 10 });
    });
    expect(queryClient.getQueryData(queryKey)).toEqual({ revision: 10 });
    queryClient.clear();
  });
});
