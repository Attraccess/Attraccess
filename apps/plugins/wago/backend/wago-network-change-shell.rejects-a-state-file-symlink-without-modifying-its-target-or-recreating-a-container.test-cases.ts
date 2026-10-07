import * as fs from 'node:fs';
import { join } from 'node:path';
import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerRejectsAStateFileSymlinkWithoutModifyingItsTargetOrRecreatingAContainer(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('rejects a state-file symlink without modifying its target or recreating a container', async () => {
    const statePath = join(scope.fixture.root, 'var/lib/attraccess-wago/state.json');
    fs.renameSync(statePath, statePath + '.saved');
    fs.symlinkSync(statePath + '.saved', statePath);
    await expect(scope.run()).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(statePath + '.saved', 'utf8'))).toEqual(scope.state);
    expect(scope.requests).toEqual([]);
  });
}
