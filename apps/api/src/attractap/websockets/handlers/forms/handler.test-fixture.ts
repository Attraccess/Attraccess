/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapFormsHandler } from './forms.handler';

export function registerAttractapFormsHandlerFixture() {
  let handler: AttractapFormsHandler;

  let mockAttractapService: { findReaderById: jest.Mock };

  let mockResourceFormsService: {
    getFormsForAction: jest.Mock;
    getFieldsWindow: jest.Mock;
    validatePageAnswers: jest.Mock;
  };

  let mockResourceActionGuard: { validateResourceAction: jest.Mock };

  function createMockSocket(overrides: any = {}): any {
    return {
      id: 'sock-1',
      readerId: 42,
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      state: {
        lastAuthenticatedUserId: 1,
        ...overrides.state,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    handler = Object.create(AttractapFormsHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockAttractapService = {
      findReaderById: jest.fn().mockResolvedValue(null),
    };
    mockResourceFormsService = {
      getFormsForAction: jest.fn(),
      getFieldsWindow: jest.fn(),
      validatePageAnswers: jest.fn(),
    };
    mockResourceActionGuard = {
      validateResourceAction: jest.fn(),
    };

    (handler as any).attractapService = mockAttractapService;
    (handler as any).resourceFormsService = mockResourceFormsService;
    (handler as any).resourceActionGuard = mockResourceActionGuard;
  });
  return {
    get handler() {
      return handler;
    },
    get mockAttractapService() {
      return mockAttractapService;
    },
    get mockResourceFormsService() {
      return mockResourceFormsService;
    },
    get mockResourceActionGuard() {
      return mockResourceActionGuard;
    },
    get createMockSocket() {
      return createMockSocket;
    },
  };
}
