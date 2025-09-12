import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { BillingModule } from './billing.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingTransaction, User } from '@attraccess/database-entities';

describe('BillingModule', () => {
  describe('metadata', () => {
    it('should declare controller, provider and export BillingService', () => {
      const importsMeta = Reflect.getMetadata('imports', BillingModule) || [];
      const controllersMeta = Reflect.getMetadata('controllers', BillingModule) || [];
      const providersMeta = Reflect.getMetadata('providers', BillingModule) || [];
      const exportsMeta = Reflect.getMetadata('exports', BillingModule) || [];

      expect(controllersMeta).toContain(BillingController);
      expect(providersMeta).toContain(BillingService);
      expect(exportsMeta).toContain(BillingService);

      // Ensure TypeOrmModule.forFeature is registered in imports
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typeOrmFeature = importsMeta.find((entry: any) => entry?.module === TypeOrmModule);
      expect(typeOrmFeature).toBeDefined();
    });
  });

  describe('instantiation with mocked repositories (no real TypeORM)', () => {
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        controllers: [BillingController],
        providers: [
          BillingService,
          { provide: getRepositoryToken(BillingTransaction), useValue: { findAndCount: jest.fn(), save: jest.fn() } },
          { provide: getRepositoryToken(User), useValue: { findOneBy: jest.fn() } },
        ],
      }).compile();
    });

    it('should resolve BillingService and BillingController', () => {
      expect(moduleRef.get(BillingService)).toBeDefined();
      expect(moduleRef.get(BillingController)).toBeDefined();
    });

    it('should resolve repository tokens', () => {
      expect(moduleRef.get(getRepositoryToken(BillingTransaction))).toBeDefined();
      expect(moduleRef.get(getRepositoryToken(User))).toBeDefined();
    });
  });
});
