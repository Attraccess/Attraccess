import type { ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope } from './wago-runtime-install-storage.spec';
export function registerEnforcesEachFilesystemPeakForDevicesJ(
  scope: ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope,
): void {
  it.each([
    [
      [1, 2, 3, 4],
      [1, 1, 1, 3],
    ],
    [
      [1, 1, 2, 3],
      [2, 1, 3],
    ],
    [
      [1, 2, 1, 3],
      [1, 1, 3],
    ],
    [
      [1, 2, 3, 1],
      [3, 1, 1],
    ],
    [
      [1, 2, 2, 3],
      [1, 2, 3],
    ],
    [
      [1, 2, 3, 2],
      [1, 4, 1],
    ],
    [
      [1, 2, 3, 3],
      [1, 1, 4],
    ],
    [
      [1, 1, 2, 2],
      [2, 4],
    ],
    [
      [1, 2, 1, 2],
      [1, 4],
    ],
    [
      [1, 2, 2, 1],
      [3, 2],
    ],
    [
      [1, 1, 1, 2],
      [2, 3],
    ],
    [
      [1, 1, 2, 1],
      [4, 1],
    ],
    [
      [1, 2, 1, 1],
      [4, 1],
    ],
    [
      [1, 2, 2, 2],
      [1, 5],
    ],
    [[1, 1, 1, 1], [5]],
    [
      [1, 2, 3],
      [1, 1, 1],
    ],
    [
      [1, 1, 2],
      [2, 1],
    ],
    [
      [1, 2, 1],
      [1, 1],
    ],
    [
      [1, 2, 2],
      [1, 2],
    ],
    [[1, 1, 1], [2]],
  ])('enforces each filesystem peak for devices %j', (devices, coefficients) => {
    const check = devices.length === 4 ? scope.run : scope.runStaging;
    const free = devices.map((device) => coefficients[device - 1] * scope.b + scope.reserve);
    scope.layout(devices, free);
    expect(check().status).toBe(0);
    for (const device of new Set(devices)) {
      scope.layout(
        devices,
        free.map((value, index) => value - (devices[index] === device ? 1 : 0)),
      );
      expect(check().status).not.toBe(0);
    }
  });
}
