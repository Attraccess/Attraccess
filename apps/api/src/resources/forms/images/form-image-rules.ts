import { BadRequestException } from '@nestjs/common';
import type { FormImageStore } from './form-image-store.port';

/**
 * Checks that every image an answer lists can be attached: it exists, no submission has it yet, it was uploaded for
 * this form field and for the submitting user (directly, or through a reader handoff opened for them). One message for
 * all failures, so an answer cannot be used to probe which ids exist.
 */
export async function assertImagesUsable(
  store: FormImageStore,
  ids: string[],
  context: { userId: number; formId: number; fieldId: number; fieldName: string },
): Promise<void> {
  const images = new Map((await store.findImages(ids)).map((image) => [image.id, image]));
  for (const id of ids) {
    const image = images.get(id);
    const usable =
      image !== undefined &&
      image.submissionId === null &&
      image.fieldId === context.fieldId &&
      image.formId === context.formId &&
      image.userId === context.userId;
    if (!usable) {
      throw new BadRequestException(`An image of field "${context.fieldName}" is not available. Add it again.`);
    }
  }
}
