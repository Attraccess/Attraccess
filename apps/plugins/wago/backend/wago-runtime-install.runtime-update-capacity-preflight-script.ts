import { bundleCapacityPreflightScript } from "./wago-runtime-install.bounded-docker.helpers";

/** Same read-only calculation powers update admission and the management probe. */
export function runtimeUpdateCapacityPreflightScript(bytes: number, testRoot = '', helperParameters = false, reportOnly = false): string {
  return bundleCapacityPreflightScript(bytes, testRoot, true, helperParameters, reportOnly, true);
}
