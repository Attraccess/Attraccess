/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';

const spec = {
  asyncapi: '3.0.0',
  info: {
    title: 'Attraccess Companion WebSocket API',
    version: '1.0.0',
    description: 'WebSocket protocol for the Attraccess Companion desktop app',
  },
  servers: {
    default: {
      host: '{host}',
      protocol: 'ws',
      pathname: '/api/companion/websocket',
      variables: {
        host: { default: 'localhost:3000', description: 'Attraccess server host and port' },
      },
    },
  },
  channels: {
    'companion/websocket': {
      address: '/api/companion/websocket',
      messages: {
        CompanionRegister: { $ref: '#/components/messages/CompanionRegister' },
        CompanionAuthenticate: { $ref: '#/components/messages/CompanionAuthenticate' },
        CompanionRequestAuthentication: { $ref: '#/components/messages/CompanionRequestAuthentication' },
        CompanionRegisterResponse: { $ref: '#/components/messages/CompanionRegisterResponse' },
        CompanionAuthenticated: { $ref: '#/components/messages/CompanionAuthenticated' },
        CompanionLockPc: { $ref: '#/components/messages/CompanionLockPc' },
        CompanionUnlockPc: { $ref: '#/components/messages/CompanionUnlockPc' },
        CompanionUpdateAvailable: { $ref: '#/components/messages/CompanionUpdateAvailable' },
      },
    },
  },
  operations: {
    COMPANION_REGISTER: {
      action: 'send',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionRegister' }],
    },
    COMPANION_AUTHENTICATE: {
      action: 'send',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionAuthenticate' }],
    },
    COMPANION_REQUEST_AUTHENTICATION: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionRequestAuthentication' }],
    },
    COMPANION_REGISTER_RESPONSE: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionRegisterResponse' }],
    },
    COMPANION_AUTHENTICATED: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionAuthenticated' }],
    },
    COMPANION_LOCK_PC: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionLockPc' }],
    },
    COMPANION_UNLOCK_PC: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionUnlockPc' }],
    },
    COMPANION_UPDATE_AVAILABLE: {
      action: 'receive',
      channel: { $ref: '#/channels/companion~1websocket' },
      messages: [{ $ref: '#/channels/companion~1websocket/messages/CompanionUpdateAvailable' }],
    },
  },
  components: {
    messages: {
      CompanionRegister: {
        name: 'COMPANION_REGISTER',
        title: 'Register new companion device',
        summary: 'Sent by the client on first run; server responds with COMPANION_REGISTER_RESPONSE',
        payload: { $ref: '#/components/schemas/EmptyPayload' },
      },
      CompanionAuthenticate: {
        name: 'COMPANION_AUTHENTICATE',
        title: 'Authenticate existing companion device',
        summary: 'Sent by the client on subsequent connections using stored credentials',
        payload: { $ref: '#/components/schemas/CompanionAuthenticatePayload' },
      },
      CompanionRequestAuthentication: {
        name: 'COMPANION_REQUEST_AUTHENTICATION',
        title: 'Server requests client to authenticate or register',
        summary: 'Sent by the server immediately on connection and when credentials are invalid',
        payload: { $ref: '#/components/schemas/EmptyPayload' },
      },
      CompanionRegisterResponse: {
        name: 'COMPANION_REGISTER_RESPONSE',
        title: 'Response to COMPANION_REGISTER',
        summary: 'Contains the device ID and token the client must persist in the OS keychain',
        payload: { $ref: '#/components/schemas/CompanionRegisterResponsePayload' },
      },
      CompanionAuthenticated: {
        name: 'COMPANION_AUTHENTICATED',
        title: 'Authentication succeeded',
        summary: 'Sent after successful register or authenticate; contains device info and assigned resources',
        payload: { $ref: '#/components/schemas/CompanionAuthenticatedPayload' },
      },
      CompanionLockPc: {
        name: 'COMPANION_LOCK_PC',
        title: 'Server requests client to lock the PC',
        payload: { $ref: '#/components/schemas/EmptyPayload' },
      },
      CompanionUnlockPc: {
        name: 'COMPANION_UNLOCK_PC',
        title: 'Server requests client to unlock the PC',
        payload: { $ref: '#/components/schemas/EmptyPayload' },
      },
      CompanionUpdateAvailable: {
        name: 'COMPANION_UPDATE_AVAILABLE',
        title: 'A companion app update is available for download',
        payload: { $ref: '#/components/schemas/CompanionUpdateAvailablePayload' },
      },
    },
    schemas: {
      EmptyPayload: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      CompanionAuthenticatePayload: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Stored device ID (omit on first run)' },
          token: { type: 'string', description: 'Stored device token (omit on first run)' },
        },
      },
      CompanionRegisterResponsePayload: {
        type: 'object',
        required: ['id', 'token'],
        properties: {
          id: { type: 'integer', description: 'Assigned device ID — persist in OS keychain' },
          token: { type: 'string', description: 'Device token — persist in OS keychain' },
        },
      },
      CompanionResourcePayload: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer', description: 'Resource ID' },
          name: { type: 'string', description: 'Resource display name' },
        },
      },
      CompanionAuthenticatedPayload: {
        type: 'object',
        required: ['deviceId', 'deviceName', 'resources'],
        properties: {
          deviceId: { type: 'integer', description: 'Device ID' },
          deviceName: { type: 'string', description: 'Admin-assigned device display name' },
          resources: {
            type: 'array',
            items: { $ref: '#/components/schemas/CompanionResourcePayload' },
            description: 'Resources this device controls',
          },
        },
      },
      CompanionUpdateAvailablePayload: {
        type: 'object',
        required: ['downloadUrl', 'version'],
        properties: {
          downloadUrl: { type: 'string', description: 'Direct download URL for the new binary' },
          version: { type: 'string', description: 'New version string' },
        },
      },
    },
  },
};

const outDir = path.resolve('dist/apps/api');
const outFile = path.join(outDir, 'asyncapi.json');
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(spec, null, 2));
console.log(`AsyncAPI spec written to ${outFile}`);
