import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CompanionDevice } from '@attraccess/database-entities';
import { randomBytes } from 'crypto';
import { genSalt, hash, compare } from 'bcrypt';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { CompanionManifestDto, CompanionVersionDto } from './dtos/companion.dto';

@Injectable()
export class CompanionService {
  private readonly logger = new Logger(CompanionService.name);
  private readonly assetsDir: string;
  private manifest: CompanionManifestDto | null = null;

  constructor(
    @InjectRepository(CompanionDevice)
    private readonly deviceRepo: Repository<CompanionDevice>,
  ) {
    this.assetsDir = join(__dirname, 'assets', 'companion-app');
    const manifestPath = join(this.assetsDir, 'companions.json');
    if (existsSync(manifestPath)) {
      try {
        this.manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CompanionManifestDto;
        this.logger.log(`Loaded companion manifest: version=${this.manifest.version}, platforms=${this.manifest.platforms.length}`);
      } catch (err) {
        this.logger.error(`Failed to parse companions.json: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn(`companions.json not found at: ${manifestPath}`);
    }
  }

  // --- Binary download ---

  getManifest(): CompanionManifestDto | null {
    return this.manifest;
  }

  getLatestVersion(): CompanionVersionDto | null {
    if (!this.manifest) return null;
    return { version: this.manifest.version, buildId: this.manifest.buildId };
  }

  getBinaryStream(platform: string, arch: string): { stream: NodeJS.ReadableStream; size: number; filename: string } {
    if (!this.manifest) {
      throw new NotFoundException('No companion manifest available');
    }

    const entry = this.manifest.platforms.find((p) => p.platform === platform && p.arch === arch);
    if (!entry) {
      throw new NotFoundException(`No companion binary for platform=${platform} arch=${arch}`);
    }

    const binaryPath = join(this.assetsDir, entry.filename);
    if (!existsSync(binaryPath)) {
      this.logger.error(`Companion binary not found on disk: ${binaryPath}`);
      throw new NotFoundException(`Companion binary file not found for platform=${platform} arch=${arch}`);
    }

    const { size } = statSync(binaryPath);
    return { stream: createReadStream(binaryPath), size, filename: entry.filename };
  }

  // --- Device management ---

  async createDevice(): Promise<{ device: CompanionDevice; token: string }> {
    const token = randomBytes(32).toString('hex');
    const salt = await genSalt(10);
    const tokenHash = await hash(token, salt);
    const name = randomBytes(3).toString('base64url').slice(0, 4);

    const device = this.deviceRepo.create({ name, tokenHash });
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
