import { Injectable } from '@nestjs/common';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';

/**
 * Read-only view of which resources have an active usage, for the reader UI slots. It lives outside
 * `handlers/ui` on purpose: UI messages must never be able to reach the usage service itself.
 */
@Injectable()
export class ReaderActiveUsageService {
  constructor(private readonly usage: ResourceUsageService) {}

  /** The given resources that have at least one active usage session. */
  async activeResourceIds(resourceIds: number[]): Promise<Set<number>> {
    const sessions = await this.usage.getActiveSessions(resourceIds);
    return new Set([...sessions].filter(([, list]) => list.length > 0).map(([id]) => id));
  }
}
