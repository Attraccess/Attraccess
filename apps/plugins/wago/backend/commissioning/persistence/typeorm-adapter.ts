import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoCommissioningSession } from '../sessions/session.entity';
import { WagoController } from '../../controllers/entity';
import { WagoEnrollment } from '../../controllers/enrollment.entity';
import { WagoConfigurationRevision } from '../../configuration/revision.entity';
import { WagoCommissioningPersistence } from './port';

export class TypeormWagoCommissioningPersistence extends WagoCommissioningPersistence {
  constructor(
    private readonly sessions: () => Repository<WagoCommissioningSession>,
    private readonly controllers: () => Repository<WagoController>,
    private readonly enrollments: () => Repository<WagoEnrollment>,
    private readonly revisions: () => Repository<WagoConfigurationRevision>,
  ) {
    super();
  }
  async session(id: number) {
    const row = await this.sessions().findOneBy({ id });
    return row ? { ...row } : null;
  }
  async claimSession(hardwareId: string, mqttServerId: number, enrollmentId: number) {
    const row = await this.sessions().findOneBy({ hardwareId, mqttServerId, enrollmentId });
    return row ? { ...row } : null;
  }
  async recentSessions(offset: number, limit: number) {
    return (await this.sessions().find({ order: { updatedAt: 'DESC' }, take: limit, skip: offset })).map((row) => ({
      ...row,
    }));
  }
  async hardwareSessions(hardwareId: string, newestFirst = false) {
    return (
      await this.sessions().find({ where: { hardwareId }, ...(newestFirst ? { order: { id: 'DESC' as const } } : {}) })
    ).map((row) => ({ ...row }));
  }
  async hardwareSessionPage(hardwareId: string, offset: number) {
    return (await this.sessions().find({ where: { hardwareId }, order: { id: 'ASC' }, take: 100, skip: offset })).map(
      (row) => ({ ...row }),
    );
  }
  async recoveryPage(offset: number, completedOnly = false) {
    return (
      await this.sessions().find({
        ...(completedOnly ? { where: { state: 'completed' as const } } : {}),
        order: { id: 'ASC' },
        take: 100,
        skip: offset,
      })
    ).map((row) => ({ ...row }));
  }
  async saveSession(input: Partial<WagoCommissioningSession>) {
    return { ...(await this.sessions().save(input)) };
  }
  async updateSession(id: number, input: Partial<WagoCommissioningSession>): Promise<void> {
    await this.sessions().update(id, input);
  }
  async removeSession(id: number): Promise<void> {
    await this.sessions().delete(id);
  }
  async controller(id: number, claimedOnly = false) {
    const row = await this.controllers().findOneBy({ id, ...(claimedOnly ? { trustState: 'claimed' as const } : {}) });
    return row ? { ...row } : null;
  }
  async controllerByHardware(hardwareId: string, mqttServerId?: number, enrollmentId?: number) {
    const row = await this.controllers().findOneBy({
      hardwareId,
      ...(mqttServerId === undefined ? {} : { mqttServerId }),
      ...(enrollmentId === undefined ? {} : { enrollmentId }),
    });
    return row ? { ...row } : null;
  }
  async enrollment(id: number) {
    const row = await this.enrollments().findOneBy({ id });
    return row ? { ...row } : null;
  }
  async latestRevision(controllerId: number) {
    const row = await this.revisions().findOne({ where: { controllerId }, order: { revision: 'DESC' } });
    return row ? { ...row } : null;
  }
}

/** Composition and fixtures only. Resolve connections after host initialization. */
export function createSqliteCommissioningPersistence(
  context: Pick<LegacySqliteContext, 'getRepository'>,
): WagoCommissioningPersistence {
  return new TypeormWagoCommissioningPersistence(
    () => context.getRepository(WagoCommissioningSession),
    () => context.getRepository(WagoController),
    () => context.getRepository(WagoEnrollment),
    () => context.getRepository(WagoConfigurationRevision),
  );
}
