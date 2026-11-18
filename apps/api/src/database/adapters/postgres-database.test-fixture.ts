import type { DataSource } from 'typeorm';
import {
  closeTestDataSource,
  createTestDatabaseLocation,
  createTestDataSource,
  type TestDatabaseLocation,
  type TestDatabaseOptions,
} from '../../test-utils/test-database';

/**
 * One real PostgreSQL database (a private copy of the migrated template) that several independent DataSources open.
 * Each `open()` is a connection pool of its own, so concurrency guarantees of the adapters (row locks, advisory
 * locks, constraints) are only meaningful across such sources.
 */
export class PostgresDatabaseFixture {
  private readonly sources: DataSource[] = [];

  private constructor(private readonly database: TestDatabaseLocation) {}

  static async create(options: { empty?: boolean } = {}): Promise<PostgresDatabaseFixture> {
    return new PostgresDatabaseFixture(await createTestDatabaseLocation(options));
  }

  /** The connection URL of the database. */
  get location(): string {
    return this.database.location;
  }

  /** A new connection pool to the same database. */
  async open(options: Omit<TestDatabaseOptions, 'location'> = {}): Promise<DataSource> {
    const source = await createTestDataSource({ ...options, location: this.database.location });
    this.sources.push(source);
    return source;
  }

  async close(): Promise<void> {
    for (const source of this.sources) await closeTestDataSource(source);
    await this.database.remove();
  }
}
