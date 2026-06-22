import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanionDevice } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { genSalt, hash, compare } from 'bcrypt';

@Injectable()
export class CompanionService {
  private readonly logger = new Logger(CompanionService.name);

  constructor(
    @InjectRepository(CompanionDevice)
    private readonly deviceRepo: Repository<CompanionDevice>,
  ) {}

  async createDevice(): Promise<{ device: CompanionDevice; token: string }> {
    const token = randomBytes(32).toString('hex');
    const salt = await genSalt(10);
    const tokenHash = await hash(token, salt);

    const device = this.deviceRepo.create({ tokenHash });
    await this.deviceRepo.save(device);
    this.logger.log(`Registered new companion device id=${device.id}`);
    return { device, token };
  }

  async findById(id: number): Promise<CompanionDevice | null> {
    return this.deviceRepo.findOne({ where: { id }, relations: ['resources'] });
  }

  async verifyToken(device: CompanionDevice, token: string): Promise<boolean> {
    return compare(token, device.tokenHash);
  }

  async touchLastConnection(device: CompanionDevice): Promise<void> {
    await this.deviceRepo.update(device.id, { lastConnection: new Date() });
  }

  async findAll(): Promise<CompanionDevice[]> {
    return this.deviceRepo.find({ relations: ['resources'] });
  }

  async updateName(id: number, name: string): Promise<CompanionDevice> {
    await this.deviceRepo.update(id, { name });
    return this.deviceRepo.findOneOrFail({ where: { id } });
  }

  async delete(id: number): Promise<void> {
    await this.deviceRepo.delete(id);
  }
}
