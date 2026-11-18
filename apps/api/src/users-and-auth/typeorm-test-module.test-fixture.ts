import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  createTestDataSourceOptions,
  createTestDatabaseLocation,
  type TestDatabaseLocation,
} from '../test-utils/test-database';

/**
 * `TypeOrmModule.forRoot` for specs that boot Nest modules: every compiled module graph gets a private PostgreSQL
 * database built from the entities. `dropTestDatabases()` removes them again (call it in `afterAll`).
 */
const locations: TestDatabaseLocation[] = [];

export const testTypeOrmModule = (): DynamicModule =>
  TypeOrmModule.forRootAsync({
    useFactory: async () => {
      const location = await createTestDatabaseLocation({ empty: true });
      locations.push(location);
      return createTestDataSourceOptions({ location: location.location, synchronize: true }) as never;
    },
  });

export async function dropTestDatabases(): Promise<void> {
  await Promise.all(locations.splice(0).map((location) => location.remove()));
}
