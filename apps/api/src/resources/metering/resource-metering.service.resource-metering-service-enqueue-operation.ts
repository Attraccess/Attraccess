import { ResourceMeteringServiceCollectInterimReadingsOperation } from './resource-metering.service.resource-metering-service-collect-interim-readings-operation';
export abstract class ResourceMeteringServiceEnqueueOperation extends ResourceMeteringServiceCollectInterimReadingsOperation {
  // ---- operations -------------------------------------------------------------------------------

  protected enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(resourceId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.queues.set(resourceId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(resourceId) === next) this.queues.delete(resourceId);
      });
    return next;
  }
}
