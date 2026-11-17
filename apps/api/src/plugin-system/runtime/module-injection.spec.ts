import 'reflect-metadata';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PLUGIN_HOST_CONNECTION } from '../persistence/plugin-host-data.port';
import { isDatabaseToken } from './database-tokens';
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
  ])('knows %p as a database token', (token) => {
    expect(isDatabaseToken(token)).toBe(true);
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
        /db-plugin.*database handle|TypeOrmModule/,
      );
    });
  });
});
