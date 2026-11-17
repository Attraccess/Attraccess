import { Inject, Injectable } from '@nestjs/common';
import { ATTRACTAP_RESOURCE_READS, type AttractapResourceReads } from '../reader-resource-reads.port';

/**
 * Read-only view of which resources have an active usage, for the reader UI slots. It lives outside
 * `handlers/ui` on purpose: UI messages must never be able to reach the usage service itself.
 */
@Injectable()
export class ReaderActiveUsageService {
  constructor(@Inject(ATTRACTAP_RESOURCE_READS) private readonly resourceReads: AttractapResourceReads) {}

  /**
   * The given resources that have at least one active usage session (the sessions the reader's resource list
   * counts as `hasActiveUsage`). Runs on every slot sync, so it reads only the resource ids. A failed read
   * counts as idle: the slots still sync, with the plugin text in the details body.
   */
  async activeResourceIds(resourceIds: number[]): Promise<Set<number>> {
    return await this.resourceReads.findResourceIdsWithActiveUsage(resourceIds);
  }
}
