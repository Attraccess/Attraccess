import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';

export function registerHandleresourcesessionstartedeventScopeFixture(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  const createMockManager = () => {
    return {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn(async () => null),
      getRepository: jest.fn(() => ({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn((data: unknown) => data),
        save: jest.fn(async (data: unknown) => data),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      save: jest.fn(async (_entity: unknown, data: any) => ({ id: 999, ...data })),
      update: jest.fn(async () => undefined),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      getRepository: jest.Mock;
      save: jest.Mock;
      update: jest.Mock;
    };
  };
  return {
    get fixture() {
      return fixture;
    },
    get createMockManager() {
      return createMockManager;
    },
  };
}
