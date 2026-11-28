import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream, type ReadStream } from 'fs';
import * as path from 'path';
import type { StorageConfigType } from '../../../config/storage.config';

/** The private directory of form images, next to (never inside) the publicly served CDN tree. */
export const FORM_IMAGE_DIRECTORY = 'form-images';

/** Stores the processed form images below `STORAGE_ROOT/form-images`, which no static route serves. */
@Injectable()
export class FormImageFileStorage {
  private readonly logger = new Logger(FormImageFileStorage.name);
  private readonly root: string;

  constructor(configService: ConfigService) {
    const storage = configService.get<StorageConfigType>('storage');
    if (!storage) throw new Error("Storage configuration ('storage') not found. Check ConfigModule setup.");
    this.root = path.resolve(storage.root, FORM_IMAGE_DIRECTORY);
  }

  /** The path of a stored file; refuses anything that would leave the form image directory. */
  private resolve(filename: string): string {
    const resolved = path.resolve(this.root, filename);
    if (path.dirname(resolved) !== this.root) throw new NotFoundException('Image not found');
    return resolved;
  }

  async write(filename: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.resolve(filename), data, { mode: 0o600 });
  }

  /** Opens the file for streaming; a missing file is a 404. */
  async open(filename: string): Promise<ReadStream> {
    const filePath = this.resolve(filename);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Image not found');
    }
    return createReadStream(filePath);
  }

  async remove(filename: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not delete form image file ${filename}: ${(error as Error).message}`);
      }
    }
  }
}
