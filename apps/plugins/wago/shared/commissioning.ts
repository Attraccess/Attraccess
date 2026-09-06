/** Data-only browser/server contracts; never import server implementations into the UI. */
export type CommissioningLeaseStatus =
  | { state: 'available' }
  | { state: 'active' | 'stale'; owner: string; leaseUntil: number; operationUntil: number; recoveryAfter: number };

export interface WagoHardwareDeploymentReport {
  version: '1';
  platform: 'supported' | 'unsupported-firmware';
  hardware: 'accessible' | 'missing-register' | 'uid10001-access-denied' | 'permission-tool-unavailable';
  exclusivity: 'clear' | 'codesys-active' | 'codesys-boot-enabled' | 'output-container-conflict' | 'unknown';
  docker: 'running' | 'installed-stopped' | 'vendor-package-missing' | 'unsupported-tool-state';
  configDocker: 'present' | 'missing';
  provision:
    | 'none'
    | 'prepare-controller'
    | 'install-vendor-runtime'
    | 'review-start-installed-runtime'
    | 'unsupported-fw31-package-activation'
    | 'unsupported-tool-state'
    | 'unsupported-lifecycle-dependencies';
  qualification: 'software-supported' | 'required';
}

/** Optional inspection and installation can independently populate this saved snapshot. */
export type WagoCommissioningPreflightReport = Partial<WagoHardwareDeploymentReport> & {
  clock?: WagoCommissioningClockReport;
};

export interface WagoCommissioningClockReport {
  hostUtc: string;
  controllerUtc: string;
  skewSeconds: number;
  uncertaintySeconds: number;
  observation: 'before-action' | 'after-action';
  previousSkewSeconds?: number;
  tool: 'supported' | 'unsupported';
  action: 'none' | 'synchronize';
  result: 'within-tolerance' | 'correction-required' | 'correcting' | 'synchronized' | 'failed';
}
