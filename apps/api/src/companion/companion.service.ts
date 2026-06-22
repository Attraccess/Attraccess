import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanionDevice } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { genSalt, hash, compare } from 'bcrypt';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface CompanionsJson {
  companions: Array<{ platform: string; version: string; downloadUrl: string }>;
}

@Injectable()
export class CompanionService {
  private readonly logger = new Logger(CompanionService.name);
  private companionsJson: CompanionsJson | null = null;

  constructor(
    @InjectRepository(CompanionDevice)
    private readonly deviceRepo: Repository<CompanionDevice>,
  ) {
    const companionsPath = join(__dirname, 'assets', 'companions.json');
    if (existsSync(companionsPath)) {
      try {
        this.companionsJson = JSON.parse(readFileSync(companionsPath, 'utf8')) as CompanionsJson;
      } catch (error) {
        this.logger.warn(`Failed to load companions.json: ${(error as Error).message}`);
      }
    }
  }

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

  getLatestVersion(platform: string): { version: string; downloadUrl: string } | null {
    if (!this.companionsJson) return null;
    const entry = this.companionsJson.companions.find((c) => c.platform === platform);
    return entry ? { version: entry.version, downloadUrl: entry.downloadUrl } : null;
  }
}
