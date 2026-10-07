export abstract class WagoRuntimeUpdateCoordinatorReconcileContract {
abstract reconcile(controllerId: number, retry?: boolean, observedImageId?: string): Promise<'busy' | 'deferred' | 'settled'>;
abstract stop(): Promise<void>;
protected abstract assertCurrent(imageId: string): Promise<void>;
protected abstract retryAt(attempt: number): number;
}
