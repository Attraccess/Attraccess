import { afterEach, describe, expect, it, vi } from 'vitest';
import { manualCommand } from '../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('front panel command transport', () => {
  it.each(['set', 'pulse', 'release'] as const)(
    'sends %s as an API object, with the applied revision',
    async (action) => {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'acknowledged' })));
      vi.stubGlobal('fetch', fetch);
      const command = {
        channelId: 'output',
        action,
        ...(action === 'set' ? { value: false } : {}),
        expectedConfigurationRevision: 7,
        acknowledgementTimeoutSeconds: 10,
      };

      await expect(manualCommand(1, command)).resolves.toEqual({ result: 'acknowledged' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/wago/controllers/1/commands'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        }),
      );
    },
  );
});
