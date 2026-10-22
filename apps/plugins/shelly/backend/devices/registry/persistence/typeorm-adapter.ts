import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import type { DeviceRegistryOperations, DeviceProbeFields } from './port';
import { ShellyDevice } from '../device.entity';
import type { AuthState } from '../../types';

export class TypeormDeviceRegistry implements DeviceRegistryOperations {
  constructor(private readonly devices: Repository<ShellyDevice>) {}

  async list() {
    return (await this.devices.find({ order: { createdAt: 'ASC', id: 'ASC' } })).map((row) => ({ ...row }));
  }
  async findById(id: number) {
    const row = await this.devices.findOne({ where: { id } });
    return row ? { ...row } : null;
  }
  async findByIp(ipAddress: string) {
    const row = await this.devices.findOne({ where: { ipAddress } });
    return row ? { ...row } : null;
  }
  async create(record: Omit<ShellyDevice, 'id'>) {
    return { ...(await this.devices.save(this.devices.create(record))) };
  }
  async updateProbe(id: number, patch: DeviceProbeFields, updatedAt: string): Promise<void> {
    await this.devices.update(id, { ...patch, updatedAt });
  }
  async updateAuthState(id: number, authState: AuthState, updatedAt: string): Promise<void> {
    await this.devices.update(id, { authState, updatedAt });
  }
  async remove(id: number): Promise<void> {
    await this.devices.delete(id);
  }
}
