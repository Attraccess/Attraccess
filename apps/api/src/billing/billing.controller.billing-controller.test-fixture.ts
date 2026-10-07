import { User } from '@attraccess/database-entities';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable } from 'rxjs';
import { DeepPartial } from 'typeorm';
import { LicenseService } from '../license/license.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { SumUpService } from './sumup.service';

const baseReq = (userOverrides: DeepPartial<User> & { effectivePermissions?: Set<string> } = {}) =>
  ({
    user: {
      id: 1,
      ...userOverrides,
    },
  }) as AuthenticatedRequest;
export function registerBillingControllerFixture() {
  let controller: BillingController;

  let service: {
    getBalance: jest.Mock;
    getHistory: jest.Mock;
    getTransaction: jest.Mock;
    getTransactionIdForUsage: jest.Mock;
    createManualTransaction: jest.Mock;
    getResourceBillingConfiguration: jest.Mock;
    updateResourceBillingConfiguration: jest.Mock;
    setConfiguration: jest.Mock;
    getConfiguration: jest.Mock;
    isBillingEnabled?: jest.Mock;
  };

  let sumUp: {
    setApiKey: jest.Mock;
    getIsEnabled: jest.Mock;
    getReaders: jest.Mock;
    pairReader: jest.Mock;
    removeReader: jest.Mock;
    topUpWithReader: jest.Mock;
    handleTransactionCallback: jest.Mock;
  };

  let live: {
    getTransactionSubject: jest.Mock;
    deleteSubjectIfUnobserved: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getBalance: jest.fn(),
      getHistory: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionIdForUsage: jest.fn(),
      createManualTransaction: jest.fn(),
      getResourceBillingConfiguration: jest.fn(),
      updateResourceBillingConfiguration: jest.fn(),
      setConfiguration: jest.fn(),
      getConfiguration: jest.fn(),
      isBillingEnabled: jest.fn().mockResolvedValue(false),
    };
    sumUp = {
      setApiKey: jest.fn(),
      getIsEnabled: jest.fn(),
      getReaders: jest.fn(),
      pairReader: jest.fn(),
      removeReader: jest.fn(),
      topUpWithReader: jest.fn(),
      handleTransactionCallback: jest.fn(),
    };
    live = {
      getTransactionSubject: jest.fn(),
      deleteSubjectIfUnobserved: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: service,
        },
        {
          provide: SumUpService,
          useValue: sumUp,
        },
        {
          provide: LiveNotificationsService,
          useValue: live,
        },
        {
          provide: ResourceFlowsService,
          useValue: { getNodes: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: SseInstrumentation,
          useValue: { wrap: <T>(_s: string, source: Observable<T>) => source },
        },
        {
          provide: LicenseService,
          useValue: { verifyLicense: jest.fn().mockResolvedValue({ valid: true, modules: [] }) },
        },
      ],
    }).compile();

    controller = module.get(BillingController);
  });
  return {
    get baseReq() {
      return baseReq;
    },
    get controller() {
      return controller;
    },
    get service() {
      return service;
    },
    get sumUp() {
      return sumUp;
    },
    get live() {
      return live;
    },
  };
}
