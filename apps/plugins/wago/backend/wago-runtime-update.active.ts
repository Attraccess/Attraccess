import type { RuntimeUpdatePhase } from "./wago-runtime-update-contracts";

export const active = new Set<RuntimeUpdatePhase>([
  'staging',
  'activating',
  'verifying',
  'accepting',
  'recovering',
  'recovery_required',
]);
