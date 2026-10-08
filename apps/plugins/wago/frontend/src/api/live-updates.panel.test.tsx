import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setupFrontPanel, panelApi } from './live-updates.test-fixture';

afterEach(cleanup);

describe('WAGO front-panel live queries', () => {
  it.each(['diagnostics', 'configuration-baseline'] as const)(
    '%s subscription failure makes front-panel controls unavailable and preserves snapshots',
    async (topic) => {
      const { hook, queryClient, baselineKey, diagnosticsKey, failures, send, diagnostics, baseline } =
        setupFrontPanel();
      await waitFor(() => expect(hook.result.current.ready).toBe(true));
      const key = topic === 'diagnostics' ? diagnosticsKey : baselineKey;
      const otherKey = topic === 'diagnostics' ? baselineKey : diagnosticsKey;
      const data = queryClient.getQueryData(key);
      await act(async () => failures.get(`plugin:wago:${topic}`)?.());
      await waitFor(() => expect(queryClient.getQueryState(key)?.status).toBe('error'));
      expect(queryClient.getQueryData(key)).toEqual(data);
      expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
      if (topic === 'diagnostics') expect(hook.result.current.live.enabled).toBe(false);
      if (topic === 'configuration-baseline') expect(hook.result.current.ready).toBe(false);
      await send(topic, { eventType: 'snapshot', value: topic === 'diagnostics' ? diagnostics : baseline });
      await waitFor(() => expect(hook.result.current.live.enabled).toBe(true));
    },
  );

  it.each(['diagnostics', 'configuration-baseline'])(
    'keeps panel %s unavailable after an older reconnect read resolves',
    async (topic) => {
      const { hook, queryClient, baseline, diagnostics, baselineKey, diagnosticsKey, send } = setupFrontPanel();
      await waitFor(() => expect(hook.result.current.ready).toBe(true));
      const queryKey = topic === 'diagnostics' ? diagnosticsKey : baselineKey;
      const value = topic === 'diagnostics' ? diagnostics : baseline;
      const otherKey = topic === 'diagnostics' ? baselineKey : diagnosticsKey;
      const query = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (!query) throw new Error('Missing panel query');
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      let refresh!: Promise<unknown>;
      await act(async () => {
        refresh = query.fetch({ ...query.options, queryFn: () => pending });
      });
      await send(topic, { eventType: 'unavailable' });
      await act(async () => {
        resolve(
          topic === 'diagnostics'
            ? { ...diagnostics, configuration: { appliedRevision: 6 } }
            : { ...baseline, revision: 6 },
        );
        await refresh;
      });
      await waitFor(() => expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle'));
      expect(queryClient.getQueryState(queryKey)?.status).toBe('error');
      expect(queryClient.getQueryData(queryKey)).toEqual(value);
      expect(queryClient.getQueryState(otherKey)?.status).toBe('success');
      if (topic === 'diagnostics') {
        expect(hook.result.current.live.enabled).toBe(false);
        const channel = hook.result.current.applied?.snapshot.logicalChannels[0];
        if (!channel) throw new Error('Missing output fixture');
        act(() => hook.result.current.live.command(channel, true));
        expect(panelApi.manual).not.toHaveBeenCalled();
      } else {
        expect(hook.result.current.ready).toBe(false);
        expect(hook.result.current.applied?.snapshot.logicalChannels[0].id).toBe('output');
      }
      await send(topic, { eventType: 'snapshot', value });
      await waitFor(() => expect(hook.result.current.ready && hook.result.current.live.enabled).toBe(true));
      hook.unmount();
      queryClient.clear();
    },
  );

  it('disables panel commands when streamed diagnostics become unavailable and restores them on snapshot', async () => {
    const { hook, queryClient, diagnostics, diagnosticsKey, baselineKey, send } = setupFrontPanel();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.live.enabled).toBe(true);
    const channel = hook.result.current.applied?.snapshot.logicalChannels[0];
    if (!channel) throw new Error('Missing applied output fixture');
    const updatedAt = queryClient.getQueryState(diagnosticsKey)?.dataUpdatedAt;

    await send('diagnostics', { eventType: 'unavailable' });
    await waitFor(() => expect(hook.result.current.live.enabled).toBe(false));
    expect(hook.result.current.diagnostics.isError).toBe(true);
    expect(hook.result.current.live.diagnostics).toEqual(diagnostics);
    expect(queryClient.getQueryData(diagnosticsKey)).toEqual(diagnostics);
    expect(queryClient.getQueryState(diagnosticsKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(baselineKey)?.status).toBe('success');
    expect(hook.result.current.ready).toBe(true);
    act(() => hook.result.current.live.command(channel, true));
    expect(panelApi.manual).not.toHaveBeenCalled();

    await send('diagnostics', { eventType: 'snapshot', value: diagnostics });
    await waitFor(() => expect(hook.result.current.live.enabled).toBe(true));
    expect(hook.result.current.diagnostics.error).toBeNull();
    expect(panelApi.baseline).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });

  it('makes the panel unready on unavailable baseline while retaining its revision, then recovers on snapshot', async () => {
    const { hook, queryClient, baseline, diagnosticsKey, baselineKey, send } = setupFrontPanel();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const applied = hook.result.current.applied;
    const updatedAt = queryClient.getQueryState(baselineKey)?.dataUpdatedAt;

    await send('configuration-baseline', { eventType: 'unavailable' });
    await waitFor(() => expect(hook.result.current.ready).toBe(false));
    expect(hook.result.current.loadError).toBe(true);
    expect(hook.result.current.applied).toEqual(applied);
    expect(queryClient.getQueryData(baselineKey)).toEqual(baseline);
    expect(queryClient.getQueryState(baselineKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(queryClient.getQueryState(diagnosticsKey)?.status).toBe('success');

    await send('configuration-baseline', { eventType: 'snapshot', value: baseline });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.loadError).toBe(false);
    expect(hook.result.current.live.enabled).toBe(true);
    expect(queryClient.getQueryState(baselineKey)?.error).toBeNull();
    expect(panelApi.baseline).toHaveBeenCalledTimes(1);
    hook.unmount();
    queryClient.clear();
  });
});
