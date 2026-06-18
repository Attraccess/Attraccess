/**
 * Suite 14 — WebSocket: Resource List & Project Updates
 *
 * - Server sends RESOURCE_LIST → device accepts without error
 * - Server sends PROJECTS_OF_USER → device accepts without error
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 90, token: 'token-suite14' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite14 Reader', success: true } });
}

beforeAll(async () => {
  server = createMockServer();
  await openSerial();
  await waitForSerialMessage(/\S/, 60_000);
  await bootstrapSuite(server);
  await authenticate();
});

afterAll(async () => {
  await closeSerial();
  await server.stop();
});

describe('WebSocket — Resource List & Project Updates', () => {
  it('device accepts RESOURCE_LIST without disconnecting', async () => {
    server.send('RESOURCE_LIST', {
      payload: {
        resources: [
          {
            id: 1,
            type: 'machine',
            name: '3D Printer',
            description: 'FDM printer',
            hasActiveUsage: false,
            isUnderMaintenance: false,
            isHealthy: true,
            healthReason: '',
            activeUser: '',
            activeStartEpoch: 0,
            activeStartUtcOffsetMinutes: 0,
            introducers: [],
            flowButtons: [],
            allowTakeOver: false,
            separateUnlockAndUnlatch: false,
          },
        ],
      },
    });

    await new Promise((r) => setTimeout(r, 2_000));
    expect(server.isConnected).toBe(true);
  });

  it('device accepts PROJECTS_OF_USER without disconnecting', async () => {
    server.send('PROJECTS_OF_USER', {
      payload: {
        page: 1,
        limit: 4,
        total: 2,
        hasMore: false,
        projects: [
          { id: 1, name: 'Project Alpha' },
          { id: 2, name: 'Project Beta' },
        ],
      },
    });

    await new Promise((r) => setTimeout(r, 2_000));
    expect(server.isConnected).toBe(true);
  });

  it('device accepts an empty RESOURCE_LIST without disconnecting', async () => {
    server.send('RESOURCE_LIST', { payload: { resources: [] } });
    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });
});
