import { User } from '@attraccess/application-models';
import { UserPersistence, AccountWriteConflictError } from './port';
export function userOperationsFake(): jest.Mocked<UserPersistence> {
  const lookup = jest.fn();
  return {
    account: lookup,
    deletedAccountByTokens: lookup,
    count: jest.fn().mockResolvedValue(0),
    createAccount: jest.fn(async (data) => ({ id: 1, ...data }) as User),
    createAccounts: jest.fn(async (data) => data.map((row, index) => ({ id: index + 1, ...row }) as User)),
    patchAccount: jest.fn(),
    hardDeleteAccount: jest.fn(),
    firstAccount: jest.fn(),
    claimSetupAccount: jest.fn(),
    roleForImport: jest.fn(),
    hasOpenUsage: jest.fn().mockResolvedValue(false),
    removeAuthentication: jest.fn(),
    removeSessions: jest.fn(),
    softDeleteAccount: jest.fn(),
    isWriteConflict: jest.fn((error) => error instanceof AccountWriteConflictError),
    ssoUser: jest.fn(),
    bySso: jest.fn(),
    byEmailsOrUsernames: jest.fn(),
    caseInsensitiveEmailMatches: jest.fn(),
    page: jest.fn(),
  };
}
