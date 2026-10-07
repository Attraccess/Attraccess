import { RuntimeStorageDiagnostic, RuntimeUpdateFailure } from "./wago-runtime-update-contracts";
export class RuntimeUpdateError extends Error {
  constructor(readonly failure: RuntimeUpdateFailure, readonly storageDiagnostics?: RuntimeStorageDiagnostic[]) {
    super(
      `CC100 runtime update failed: ${failure}. See the controller runtime status for the reason and recovery steps.`,
    );
  }
}