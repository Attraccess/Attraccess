import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { ManagedRuntimeUpdateHost, RuntimeUpdateRecord, RuntimeUpdateStore } from "./wago-runtime-update-contracts";
import { WagoRuntimeUpdateCoordinatorReconcileContract } from "./wago-runtime-update.wago-runtime-update-coordinator-reconcile-contract";
export abstract class WagoRuntimeUpdateCoordinatorState extends WagoRuntimeUpdateCoordinatorReconcileContract {

  protected readonly running = new Set<number>();

  protected readonly operations = new Set<AbortController>();

  protected readonly shutdownWaiters = new Set<() => void>();

  protected stopped = false;


  constructor(
    protected readonly store: RuntimeUpdateStore,
    protected readonly desired: () => Promise<BuildRuntimeArtifact>,
    protected readonly host: ManagedRuntimeUpdateHost,
    protected readonly audit: (record: Readonly<RuntimeUpdateRecord>) => Promise<void>,
    protected readonly now = Date.now,
    protected readonly concurrency = 2,
  ) {
      super();
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4)
      throw new Error('Invalid update concurrency');
  }
}
