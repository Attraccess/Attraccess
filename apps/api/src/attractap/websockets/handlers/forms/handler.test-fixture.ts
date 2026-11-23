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

  let mockReaderImages: Record<string, jest.Mock>;

  function createMockSocket(overrides: any = {}): any {
    return {
      id: 'sock-1',
      readerId: 42,
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      state: {
        verifiedUserId: 1,
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
      getFormsForAction: jest.fn().mockResolvedValue([]),
      getFieldsWindow: jest.fn(),
      validatePageAnswers: jest.fn(),
    };
    mockResourceActionGuard = {
      validateResourceAction: jest.fn(),
    };

    mockReaderImages = {
      supports: jest.fn().mockResolvedValue(false),
      adapt: jest.fn(async (_socket: unknown, forms: unknown[]) => ({ forms, blocked: false })),
      describeField: jest.fn().mockResolvedValue(null),
      fillAnswers: jest.fn(async (_socket: unknown, _where: unknown, _form: unknown, answers: unknown[]) => answers),
      refreshDraft: jest.fn().mockResolvedValue(undefined),
      endAttempt: jest.fn(),
      endAllForReader: jest.fn(),
    };
    (handler as any).readerImages = mockReaderImages;
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
    get mockReaderImages() {
      return mockReaderImages;
    },
    get mockResourceActionGuard() {
      return mockResourceActionGuard;
    },
    get createMockSocket() {
      return createMockSocket;
    },
  };
}
