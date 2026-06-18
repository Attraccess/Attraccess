/**
 * Suite 11 — WebSocket: Resource Usage Form (Multi-Page)
 *
 * - Server sends RESOURCE_USAGE_FORM_REQUEST
 * - Device sends RESOURCE_USAGE_FORM_GET_FIELDS for each page
 * - Server responds with RESOURCE_USAGE_FORM_FIELDS
 * - Device submits each page: RESOURCE_USAGE_FORM_SUBMIT_PAGE
 * - Server confirms: RESOURCE_USAGE_FORM_PAGE_RESULT
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockWsServer } from '../mock-server/index.js';
import { openSerial, closeSerial, waitForSerialMessage } from '../helpers/serial.js';
import { bootstrapSuite, createMockServer } from './setup.js';

const FORM_TIMEOUT_MS = 30_000;

let server: MockWsServer;

async function authenticate() {
  await server.waitForMessage('READER_REGISTER', 15_000);
  server.send('READER_REGISTER', { payload: { id: 60, token: 'token-suite11' } });
  await server.waitForMessage('READER_AUTHENTICATE', 15_000);
  server.send('READER_AUTHENTICATED', { payload: { name: 'Suite11 Reader', success: true } });
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

describe('WebSocket — Resource Usage Form (Multi-Page)', () => {
  const RESOURCE_ID = 7;
  const FORM_ID = 100;

  it('device requests form fields after RESOURCE_USAGE_FORM_REQUEST', async () => {
    server.send('RESOURCE_USAGE_FORM_REQUEST', {
      payload: {
        resourceId: RESOURCE_ID,
        resourceName: 'Laser Cutter',
        action: 'START',
        forms: [{ id: FORM_ID, name: 'Usage Form', fieldCount: 1 }],
      },
    });

    const fieldsReq = await server.waitForMessage(
      'RESOURCE_USAGE_FORM_GET_FIELDS',
      FORM_TIMEOUT_MS
    ) as Record<string, unknown>;
    expect(fieldsReq).toBeDefined();
    expect(fieldsReq.formId ?? fieldsReq.form_id).toBeDefined();
  });

  it('device submits form page after receiving fields', async () => {
    // Respond with a single text field
    server.send('RESOURCE_USAGE_FORM_FIELDS', {
      payload: {
        resourceId: RESOURCE_ID,
        action: 'START',
        formId: FORM_ID,
        offset: 0,
        totalFieldCount: 1,
        fields: [
          {
            id: 1001,
            type: 'TEXT',
            isRequired: false,
            name: 'Project',
            description: 'Project name',
            options: { text: { placeholder: 'Enter project', multiline: false } },
          },
        ],
      },
    });

    const submission = await server.waitForMessage(
      'RESOURCE_USAGE_FORM_SUBMIT_PAGE',
      FORM_TIMEOUT_MS
    ) as Record<string, unknown>;
    expect(submission).toBeDefined();
    expect(submission.formId ?? submission.form_id).toBeDefined();
  });

  it('device accepts RESOURCE_USAGE_FORM_PAGE_RESULT', async () => {
    server.send('RESOURCE_USAGE_FORM_PAGE_RESULT', {
      payload: {
        resourceId: RESOURCE_ID,
        action: 'START',
        formId: FORM_ID,
        offset: 0,
        valid: true,
        errors: [],
      },
    });

    await new Promise((r) => setTimeout(r, 1_000));
    expect(server.isConnected).toBe(true);
  });
});
