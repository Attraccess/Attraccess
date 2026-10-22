import { AttractapPersistence } from './port';
export function attractapOperationsFake(): jest.Mocked<AttractapPersistence> {
  return {
    recordCrash: jest.fn(),
    readerFirmware: jest.fn(),
    recordSymbolication: jest.fn(),
    readerCrashReports: jest.fn(),
    crashCoredump: jest.fn(),
    touchReader: jest.fn(),
    readerWithResources: jest.fn(),
    registerReader: jest.fn(),
    resourcesByIds: jest.fn(),
    saveReader: jest.fn(),
    removeReader: jest.fn(),
    listReaders: jest.fn(),
    findUser: jest.fn(),
    saveUser: jest.fn(),
    cardById: jest.fn(),
    cardByUid: jest.fn(),
    userCards: jest.fn(),
    allCards: jest.fn(),
    registerActiveCard: jest.fn(),
    activateCard: jest.fn(),
    deactivateCard: jest.fn(),
    removeCard: jest.fn(),
    touchCard: jest.fn(),
  };
}
