import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FORM_IMAGE_ORPHAN_TTL_MS } from '@attraccess/application-models';
import { FormImageFileStorage } from './form-image-file-storage';
import { FORM_IMAGE_STORE, type FormImageStore } from './form-image-store.port';

const BATCH = 200;
/** An expired or ended handoff stays this long, so a reader that asks again still finds its images and count. */
const HANDOFF_GRACE_MS = 60 * 60 * 1000;

/**
 * Deletes the images no submission references 24 hours after their upload (never submitted, or their submission was
 * deleted, which resets the reference), right away those of a deleted user, and the handoffs that are long over. Safe
 * to run on several instances, and while images are attached: a row is deleted only while it is still unattached, and
 * only the files of deleted rows are removed.
 */
@Injectable()
export class FormImageCleanupService {
  private readonly logger = new Logger(FormImageCleanupService.name);

  constructor(
    @Inject(FORM_IMAGE_STORE) private readonly store: FormImageStore,
    private readonly files: FormImageFileStorage,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runScheduled(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`Form image cleanup failed: ${(error as Error).message}`);
    }
  }

  async run(now = new Date()): Promise<{ images: number; handoffs: number }> {
    let images = 0;
    for (;;) {
      const batch = await this.store.findOrphanImages(new Date(now.getTime() - FORM_IMAGE_ORPHAN_TTL_MS), BATCH);
      if (!batch.length) break;
      const deleted = await this.store.deleteOrphanImages(batch.map((image) => image.id));
      for (const filename of deleted) await this.files.remove(filename);
      images += deleted.length;
      if (batch.length < BATCH) break;
    }
    const handoffs = await this.store.deleteStaleHandoffs(new Date(now.getTime() - HANDOFF_GRACE_MS));
    if (images || handoffs) this.logger.log(`Deleted ${images} unused form images and ${handoffs} old handoff links`);
    return { images, handoffs };
  }
}
