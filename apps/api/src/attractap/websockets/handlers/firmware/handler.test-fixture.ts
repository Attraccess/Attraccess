/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, openSync, readSync, statSync } from 'fs';
import { AttractapFirmwareHandler } from './firmware.handler';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    statSync: jest.fn(),
    openSync: jest.fn(),
    readSync: jest.fn(),
  };
});

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;

const mockOpenSync = openSync as jest.MockedFunction<typeof openSync>;

const mockReadSync = readSync as jest.MockedFunction<typeof readSync>;
export function registerAttractapFirmwareHandlerFixture() {
  let handler: AttractapFirmwareHandler;

  let mockAttractapService: { updateReaderFirmware: jest.Mock };

  let mockFirmwareService: { getFirmwareDefinition: jest.Mock };

  let mockMetricsService: { attractapFirmwareUpdatesTotal: { inc: jest.Mock } };

  let socket: any;

  function makeSocket(overrides: any = {}): any {
    return {
      id: 'sock-1',
      readerId: 42,
      state: { ota: null },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    handler = Object.create(AttractapFirmwareHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockAttractapService = { updateReaderFirmware: jest.fn().mockResolvedValue(undefined) };
    mockFirmwareService = { getFirmwareDefinition: jest.fn() };
    mockMetricsService = { attractapFirmwareUpdatesTotal: { inc: jest.fn() } };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).firmwareService = mockFirmwareService;
    (handler as any).metricsService = mockMetricsService;

    socket = makeSocket();
  });
  return {
    get mockExistsSync() {
      return mockExistsSync;
    },
    get mockStatSync() {
      return mockStatSync;
    },
    get mockOpenSync() {
      return mockOpenSync;
    },
    get mockReadSync() {
      return mockReadSync;
    },
    get handler() {
      return handler;
    },
    get mockAttractapService() {
      return mockAttractapService;
    },
    get mockFirmwareService() {
      return mockFirmwareService;
    },
    get mockMetricsService() {
      return mockMetricsService;
    },
    get socket() {
      return socket;
    },
    get makeSocket() {
      return makeSocket;
    },
  };
}
