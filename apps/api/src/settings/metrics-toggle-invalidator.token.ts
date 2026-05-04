// Provider token for metrics toggle cache invalidation from settings writes
// FEATURE: Metrics — admin-controlled timing instrumentation toggles
export const METRICS_TOGGLE_INVALIDATOR = Symbol('METRICS_TOGGLE_INVALIDATOR');

export interface MetricsToggleInvalidator {
  refresh(): Promise<void>;
}
