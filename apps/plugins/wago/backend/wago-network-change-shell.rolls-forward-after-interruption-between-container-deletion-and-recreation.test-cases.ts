import type { FixedMqttRecreationProgramAndDurableStateTestScope } from "./wago-network-change-shell.spec";
export function registerRollsForwardAfterInterruptionBetweenContainerDeletionAndRecreation(scope: FixedMqttRecreationProgramAndDurableStateTestScope): void {
it('rolls forward after interruption between container deletion and recreation', async () => {
    scope.interruptCreate = true;
    await expect(scope.run()).rejects.toThrow('interrupted');
    expect(scope.current).toBeNull();
    expect(JSON.parse(scope.fixture.read('var/lib/attraccess-wago/state.json')).credentials.password).toBe(scope.payload.password);
    scope.interruptCreate = false;
    await scope.run();
    expect(scope.created).toMatchObject({ Image: scope.image, HostConfig: { RestartPolicy: { Name: 'no' } } });
    expect(JSON.parse(scope.fixture.read('var/lib/attraccess-wago/state.json')).accepted).toEqual(scope.state.accepted);
  });
}
