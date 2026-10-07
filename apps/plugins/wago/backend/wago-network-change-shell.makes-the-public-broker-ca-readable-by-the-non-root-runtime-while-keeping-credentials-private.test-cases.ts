import * as fs from 'node:fs';
import { join } from 'node:path';
import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerMakesThePublicBrokerCaReadableByTheNonRootRuntimeWhileKeepingCredentialsPrivate(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('makes the public broker CA readable by the non-root runtime while keeping credentials private', async () => {
    await scope.run();
    const mode = (path: string) => fs.statSync(join(scope.fixture.root, path)).mode & 0o777;
    expect(mode('etc/attraccess-wago/runtime-ca.pem')).toBe(0o444);
    expect(mode('etc/attraccess-wago/runtime.env')).toBe(0o600);
    expect(mode('var/lib/attraccess-wago/state.json')).toBe(0o600);
  });
}
