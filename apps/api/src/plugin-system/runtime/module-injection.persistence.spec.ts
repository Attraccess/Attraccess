import 'reflect-metadata';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PLUGIN_HOST_CONNECTION } from '../persistence/plugin-host-data.port';
import { ModuleRef } from '@nestjs/core';
import { PersistenceCoreModule } from '../../database/adapters/common/persistence-core.module';
import { TransactionHandles } from '../../database/adapters/common/transaction-handles';
import { EntityManagerResolver } from '../../database/adapters/entity-manager-resolver';
import { TransactionContextResolver } from '../../database/adapters/transaction-context';
import { ScopedUnitOfWork } from '../../database/unit-of-work';
import { isDatabaseHandle, isDatabaseToken } from './database-tokens';
import { assertModuleHasNoDatabaseInjection } from './module-injection';

describe('plugins and the database', () => {
  it.each([
    DataSource,
    EntityManager,
    Repository,
    'DataSource',
    'EntityManager',
    'UserRepository',
    Symbol('DataSource'),
    PLUGIN_HOST_CONNECTION,
    class DataSource {},
    Symbol.for('attraccess.unit-of-work'),
    Symbol.for('attraccess.database.lifecycle'),
    Symbol.for('attraccess.plugin-system.host-data'),
    Symbol.for('attraccess.plugin-system.core-lookup'),
    TransactionHandles,
    EntityManagerResolver,
    TransactionContextResolver,
    ModuleRef,
    'ModuleRef',
  ])('knows %p as a database token', (token) => {
    expect(isDatabaseToken(token)).toBe(true);
  });

  it('knows every provider the persistence core module exports', () => {
    const exported = Reflect.getMetadata('exports', PersistenceCoreModule) as unknown[];
    expect(exported.length).toBeGreaterThan(0);
    for (const token of exported) expect(isDatabaseToken(token)).toBe(true);
  });

  it('recognises database handles among resolved providers', () => {
    expect(isDatabaseHandle(Object.create(DataSource.prototype))).toBe(true);
    expect(isDatabaseHandle(new ScopedUnitOfWork({} as never))).toBe(true);
    expect(isDatabaseHandle({ query: () => undefined })).toBe(false);
    expect(isDatabaseHandle(undefined)).toBe(false);
  });

  it.each(['EventEmitter2', 'PLUGIN_CONTEXT', Symbol.for('attraccess.plugin.context'), class Service {}, undefined])(
    'lets %p through',
    (token) => {
      expect(isDatabaseToken(token)).toBe(false);
    },
  );

  describe('module injection', () => {
    class Plain {}
    class M {}

    it('accepts a module whose providers and controllers ask for nothing database-like', () => {
      @Injectable()
      class Service {
        constructor(readonly plain: Plain) {}
      }
      expect(() => assertModuleHasNoDatabaseInjection('p', { module: M, providers: [Service, Plain] })).not.toThrow();
    });

    it.each([
      [
        'a constructor parameter typed with the connection',
        () => {
          @Injectable()
          class Service {
            constructor(readonly source: DataSource) {}
          }
          return { module: M, providers: [Service] };
        },
      ],
      [
        'an @Inject token',
        () => {
          class Service {
            constructor(@Inject('WidgetRepository') readonly repository: unknown) {}
          }
          return { module: M, providers: [Service] };
        },
      ],
      [
        'a controller',
        () => {
          @Injectable()
          class Controller {
            constructor(readonly manager: EntityManager) {}
          }
          return { module: M, controllers: [Controller] };
        },
      ],
      [
        'a factory provider',
        () => ({
          module: M,
          providers: [{ provide: 'x', useFactory: () => 1, inject: [DataSource] }],
        }),
      ],
      [
        'an alias to the connection',
        () => ({
          module: M,
          providers: [{ provide: 'x', useExisting: PLUGIN_HOST_CONNECTION }],
        }),
      ],
      ['the TypeORM module', () => ({ module: M, imports: [{ module: class TypeOrmModule {} }] })],
      [
        'a nested module',
        () => {
          @Injectable()
          class Service {
            constructor(readonly source: DataSource) {}
          }
          return { module: M, imports: [{ module: class Inner {}, providers: [Service] }] };
        },
      ],
    ])('refuses %s', (_label, build) => {
      expect(() => assertModuleHasNoDatabaseInjection('db-plugin', build() as never)).toThrow(
        /db-plugin.*(database handle|TypeOrmModule).*migrating-to-2/s,
      );
    });
  });
});
