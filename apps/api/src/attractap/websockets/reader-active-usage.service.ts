import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceUsage } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';
import { activeUsageWhere } from '../../resources/usage/sessions/active-usage';

/**
 * Read-only view of which resources have an active usage, for the reader UI slots. It lives outside
 * `handlers/ui` on purpose: UI messages must never be able to reach the usage service itself.
 */
@Injectable()
export class ReaderActiveUsageService {
  private readonly logger = new Logger(ReaderActiveUsageService.name);

  constructor(@InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>) {}

  /**
   * The given resources that have at least one active usage session (the sessions the reader's resource list
   * counts as `hasActiveUsage`). Runs on every slot sync, so it reads only the resource ids. A failed read
   * counts as idle: the slots still sync, with the plugin text in the details body.
   */
  async activeResourceIds(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    try {
      const rows = await this.usages.find({
        where: { resourceId: In(resourceIds), ...activeUsageWhere() },
        select: { resourceId: true },
      });
      return new Set(rows.map((row) => row.resourceId));
    } catch (error) {
      this.logger.warn(`Could not read active usages for resources ${resourceIds.join(',')}: ${String(error)}`);
      return new Set();
    }
  }
}
