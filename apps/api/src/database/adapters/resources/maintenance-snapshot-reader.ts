import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { DataSource, EntityManager, IsNull } from 'typeorm';

/** Reads committed history without borrowing the main connection's in-flight transaction. */
export class MaintenanceSnapshotReader {
  private connection?: Promise<DataSource>;
  private closed = false;

  constructor(private readonly source: DataSource) {}

  async manager(): Promise<EntityManager> {
    if (this.closed) throw new Error('Maintenance snapshot reader is closed');
    if (this.source.options.type !== 'better-sqlite3' || this.source.options.database === ':memory:') {
      throw new Error('Maintenance snapshots require a file-backed SQLite database');
    }
    if (!this.connection) {
      // Read-only, so it never takes SQLite's write lock: better-sqlite3 reads hold their shared lock only while the
      // (synchronous) statement runs, and this connection never opens a transaction.
      this.connection = new DataSource({
        ...this.source.options,
        synchronize: false,
        migrationsRun: false,
        dropSchema: false,
        subscribers: [],
        // Preserve the file's journal mode; opening a reader must not change it.
        enableWAL: false,
        readonly: true,
        fileMustExist: true,
      })
        .initialize()
        .catch((error) => {
          this.connection = undefined;
          throw error;
        });
    }
    return (await this.connection).manager;
  }

  /** The owner must finish active evaluations before closing their reader. */
  async close(): Promise<void> {
    this.closed = true;
    const pending = this.connection;
    this.connection = undefined;
    if (!pending) return;
    const connection = await pending;
    if (connection.isInitialized) await connection.destroy();
  }
}

/**
 * Completed usage timestamps and closed operating intervals are immutable in the
 * application. New rows, open rows, and lifecycle reservations therefore
 * describe every history change that can invalidate a duration calculation.
 * Schedule configuration, service-cycle baseline, and active maintenance must be
 * checked separately by the evaluator before accepting this fingerprint.
 */
export async function captureDurationState(resourceId: number, manager: EntityManager): Promise<string> {
  const usages = manager.getRepository(ResourceUsage);
  const [latestUsage, mutableUsages, latestInterval, attempts] = await Promise.all([
    usages.findOne({ where: { resourceId }, order: { id: 'DESC' }, select: { id: true } }),
    usages.find({
      // Pending candidates are created open and then accepted or deleted; they
      // never become closed while pending. The indexed open-row lookup includes
      // them without scanning closed history for a redundant pending predicate.
      where: { resourceId, endTime: IsNull() },
      select: { id: true, startTime: true, endTime: true, lifecyclePending: true, usageAction: true },
      order: { id: 'ASC' },
    }),
    manager.getRepository(ResourceOperatingInterval).findOne({
      where: { resourceId },
      order: { startTime: 'DESC', id: 'DESC' },
      select: { id: true, startTime: true, endTime: true },
    }),
    manager.getRepository(ResourceUsageLifecycleAttempt).find({
      where: { resourceId },
      select: { id: true, previousUsageId: true, transitionTime: true, kind: true },
      order: { id: 'ASC' },
    }),
  ]);
  return JSON.stringify({ latestUsage, mutableUsages, latestInterval, attempts });
}
