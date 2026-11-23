import type { FormImageHandoffRecord, ResourceFormAction } from '@attraccess/application-models';
import type {
  FormImageHandoffKey,
  FormImageOwnership,
  FormImageStore,
  NewFormImage,
  NewFormImageHandoff,
  StoredFormImage,
} from './form-image-store.port';

/** An in-memory form image store with the semantics of the database one. */
export class InMemoryFormImageStore implements FormImageStore {
  readonly images = new Map<string, StoredFormImage>();
  readonly handoffs = new Map<string, FormImageHandoffRecord & { tokenHash: string }>();
  /** The user of each submission id, for ownership checks. */
  readonly submissionUsers = new Map<number, number>();
  now = () => new Date();

  async insertImage(image: NewFormImage): Promise<StoredFormImage> {
    const record: StoredFormImage = { ...image, submissionId: null, createdAt: this.now() };
    this.images.set(record.id, record);
    return record;
  }

  async findImage(id: string) {
    return this.images.get(id) ?? null;
  }

  async findImageWithOwner(id: string): Promise<FormImageOwnership | null> {
    const image = this.images.get(id);
    if (!image) return null;
    return {
      image,
      submissionUserId: image.submissionId === null ? null : (this.submissionUsers.get(image.submissionId) ?? null),
    };
  }

  async findImages(ids: string[]) {
    return ids.flatMap((id) => (this.images.has(id) ? [this.images.get(id) as StoredFormImage] : []));
  }

  async listHandoffImages(handoffId: string) {
    return [...this.images.values()]
      .filter((image) => image.handoffId === handoffId && image.submissionId === null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async countHandoffImages(handoffId: string) {
    return (await this.listHandoffImages(handoffId)).length;
  }

  async countUnattachedImages(userId: number, since: Date) {
    return [...this.images.values()].filter(
      (image) => image.userId === userId && image.submissionId === null && image.createdAt >= since,
    ).length;
  }

  async deleteUnattachedImage(id: string, handoffId?: string) {
    const image = this.images.get(id);
    if (!image || image.submissionId !== null || (handoffId !== undefined && image.handoffId !== handoffId)) {
      return false;
    }
    this.images.delete(id);
    return true;
  }

  async insertHandoff(handoff: NewFormImageHandoff) {
    const record = { ...handoff, endedAt: null, createdAt: this.now() };
    this.handoffs.set(record.id, record);
    return record;
  }

  async findHandoffByTokenHash(tokenHash: string) {
    return [...this.handoffs.values()].find((handoff) => handoff.tokenHash === tokenHash) ?? null;
  }

  async findLatestHandoff(key: FormImageHandoffKey) {
    const keys = Object.keys(key) as (keyof FormImageHandoffKey)[];
    return (
      [...this.handoffs.values()]
        .filter((handoff) => handoff.endedAt === null && keys.every((name) => handoff[name] === key[name]))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async moveHandoffImages(fromHandoffId: string, toHandoffId: string) {
    for (const image of this.images.values()) {
      if (image.handoffId === fromHandoffId && image.submissionId === null) image.handoffId = toHandoffId;
    }
  }

  async endHandoffs(readerId: number, now: Date, only?: { resourceId: number; action: ResourceFormAction }) {
    let ended = 0;
    for (const handoff of this.handoffs.values()) {
      const matches = !only || (handoff.resourceId === only.resourceId && handoff.action === only.action);
      if (handoff.readerId === readerId && handoff.endedAt === null && matches) {
        handoff.endedAt = now;
        ended += 1;
      }
    }
    return ended;
  }

  async endHandoffsById(ids: string[], now: Date) {
    let ended = 0;
    for (const id of ids) {
      const handoff = this.handoffs.get(id);
      if (handoff && handoff.endedAt === null) {
        handoff.endedAt = now;
        ended += 1;
      }
    }
    return ended;
  }

  async reserveHandoffUpload(handoffId: string, now: Date) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff || handoff.endedAt || handoff.expiresAt <= now || handoff.uploadCount >= handoff.maxImages) {
      return false;
    }
    handoff.uploadCount += 1;
    return true;
  }

  async releaseHandoffUpload(handoffId: string) {
    const handoff = this.handoffs.get(handoffId);
    if (handoff) handoff.uploadCount = Math.max(0, handoff.uploadCount - 1);
  }

  async endHandoff(handoffId: string, now: Date) {
    const handoff = this.handoffs.get(handoffId);
    if (handoff && !handoff.endedAt) handoff.endedAt = now;
  }

  async findOrphanImages(uploadedBefore: Date, limit: number) {
    return [...this.images.values()]
      .filter((image) => image.submissionId === null && (image.createdAt < uploadedBefore || image.userId === null))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  async deleteOrphanImages(ids: string[]) {
    const filenames: string[] = [];
    for (const id of ids) {
      const image = this.images.get(id);
      if (image && image.submissionId === null) {
        this.images.delete(id);
        filenames.push(image.filename);
      }
    }
    return filenames;
  }

  async deleteStaleHandoffs(before: Date) {
    let deleted = 0;
    for (const [id, handoff] of this.handoffs) {
      const stale = handoff.expiresAt < before || (handoff.endedAt !== null && handoff.endedAt < before);
      if (stale && (await this.countHandoffImages(id)) === 0) {
        this.handoffs.delete(id);
        for (const image of this.images.values()) if (image.handoffId === id) image.handoffId = null;
        deleted += 1;
      }
    }
    return deleted;
  }
}
