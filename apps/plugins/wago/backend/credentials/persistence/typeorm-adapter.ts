import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoController } from '../../controllers/entity';
import { WagoCredentialRotationEntity } from './schema';
import type { WagoCredentialRotation } from './records';
import { WagoCredentialPersistence } from './port';

export class TypeormWagoCredentialPersistence extends WagoCredentialPersistence {
  constructor(
    private readonly controllerSource: () => Repository<WagoController>,
    private readonly rotationSource: () => Repository<WagoCredentialRotationEntity>,
  ) {
    super();
  }

  private get controllers() {
    return this.controllerSource();
  }
  private get rotations() {
    return this.rotationSource();
  }
  async controller(id: number) {
    const row = await this.controllers.findOneBy({ id });
    return row ? { ...row } : null;
  }
  async credentialEpoch(controllerId: number): Promise<string | null> {
    const [row]: { epoch: string | null }[] = await this.rotations.query(
      'SELECT credential_epoch AS epoch FROM plugin_wago_controllers WHERE id = ?',
      [controllerId],
    );
    return row?.epoch ?? null;
  }
  async rotation(controllerId: number, includeRecoverySecret = false) {
    const query = this.rotations
      .createQueryBuilder('rotation')
      .where('rotation.controllerId = :controllerId', { controllerId });
    if (includeRecoverySecret) query.addSelect('rotation.encryptedCredentials');
    const row = await query.getOne();
    return row ? { ...row } : null;
  }
  async rotationStatus(controllerId: number) {
    const row = await this.rotations.findOne({ where: { controllerId }, select: { phase: true, revision: true } });
    return row ? { phase: row.phase, revision: row.revision } : null;
  }
  async saveRotation(row: WagoCredentialRotation): Promise<void> {
    await this.rotations.save(this.rotations.create(row));
  }
  async removeRotation(controllerId: number): Promise<void> {
    await this.rotations.delete(controllerId);
  }
}
