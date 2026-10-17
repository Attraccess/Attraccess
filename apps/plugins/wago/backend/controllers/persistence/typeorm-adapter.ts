import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import { TypeormWagoConfigurationPersistence } from '../../configuration/persistence/typeorm-adapter';
import { WagoConfigurationPersistence } from '../../configuration/persistence/port';
import { WagoConfigurationDraft } from '../../configuration/draft.entity';
import { WagoConfigurationRevision } from '../../configuration/revision.entity';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoController } from '../entity';
import { WagoEnrollment } from '../enrollment.entity';
import { WagoSettings } from '../settings.entity';
import { WagoControllerPersistence } from './port';

export class TypeormWagoControllerPersistence extends WagoControllerPersistence {
  constructor(
    private readonly registrySource: () => Repository<WagoController>,
    private readonly enrollmentSource: () => Repository<WagoEnrollment>,
    private readonly settingsSource: () => Repository<WagoSettings>,
  ) {
    super();
  }
  private get registry() {
    return this.registrySource();
  }
  private get enrollments() {
    return this.enrollmentSource();
  }
  private get preferences() {
    return this.settingsSource();
  }
  async commandControllers(id?: number) {
    return (
      await this.registry.find({
        where: { trustState: 'claimed', ...(id === undefined ? {} : { id }) },
        order: { name: 'ASC' },
      })
    ).map((row) => ({ ...row }));
  }
  async controller(id: number) {
    const row = await this.registry.findOneBy({ id });
    return row ? { ...row } : null;
  }
  async controllerByHardware(hardwareId: string) {
    const row = await this.registry.findOneBy({ hardwareId });
    return row ? { ...row } : null;
  }
  async controllers(order?: 'hardwareId', claimedOnly = false) {
    return (
      await this.registry.find({
        ...(claimedOnly ? { where: { trustState: 'claimed' as const } } : {}),
        ...(order ? { order: { hardwareId: 'ASC' as const } } : {}),
      })
    ).map((row) => ({ ...row }));
  }
  async saveController(input: Partial<WagoController>) {
    return { ...(await this.registry.save(this.registry.create(input))) };
  }
  async removeController(id: number): Promise<void> {
    await this.registry.delete(id);
  }
  async enrollment(id: number) {
    const row = await this.enrollments.findOneBy({ id });
    return row ? { ...row } : null;
  }
  async enrollmentBySecret(secretHash: string, mqttServerId: number, hardwareId: string) {
    const row = await this.enrollments.findOneBy({ secretHash, mqttServerId, hardwareId });
    return row ? { ...row } : null;
  }
  async unconsumedEnrollments() {
    return (
      await this.enrollments.createQueryBuilder('enrollment').where('enrollment.consumedAt IS NULL').getMany()
    ).map((row) => ({ ...row }));
  }
  async activeEnrollments(now: string) {
    return (
      await this.enrollments
        .createQueryBuilder('enrollment')
        .where('enrollment.consumedAt IS NULL')
        .andWhere('enrollment.revokedAt IS NULL')
        .andWhere('enrollment.expiresAt > :now', { now })
        .getMany()
    ).map((row) => ({ ...row }));
  }
  async saveEnrollment(input: Partial<WagoEnrollment>) {
    return { ...(await this.enrollments.save(this.enrollments.create(input))) };
  }
  async removeEnrollment(id: number): Promise<void> {
    await this.enrollments.delete(id);
  }
  async settings() {
    const row = await this.preferences.findOneBy({ id: 1 });
    return row ? { ...row } : null;
  }
  async initializeSettings(input: WagoSettings) {
    await this.preferences.createQueryBuilder().insert().values(input).orIgnore().execute();
    return { ...(await this.preferences.findOneByOrFail({ id: 1 })) };
  }
  async saveSettings(input: WagoSettings): Promise<void> {
    await this.preferences.save(input);
  }
}

/** Composition only. Repository resolution stays lazy until the host connection is ready. */
export function createWagoRegistryPersistence(
  context: Pick<LegacySqliteContext, 'getRepository' | 'dataSource'>,
): [WagoControllerPersistence, WagoConfigurationPersistence] {
  return [
    new TypeormWagoControllerPersistence(
      () => context.getRepository(WagoController),
      () => context.getRepository(WagoEnrollment),
      () => context.getRepository(WagoSettings),
    ),
    new TypeormWagoConfigurationPersistence(
      () => context.getRepository(WagoConfigurationDraft),
      () => context.getRepository(WagoConfigurationRevision),
      () => context.dataSource.getRepository('ResourceFlowNode'),
    ),
  ];
}
