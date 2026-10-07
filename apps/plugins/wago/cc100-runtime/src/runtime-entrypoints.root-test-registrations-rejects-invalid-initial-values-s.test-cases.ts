import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsRejectsInvalidInitialValuesS(scope: RootTestRegistrationsTestScope): void {
  test.each(['null', '[]', '{"point":"invalid"}'])('rejects invalid initial values %s', async (values) => {
    process.env.WAGO_INITIAL_VALUES = values;
    await expect(import('./simulator')).rejects.toThrow('WAGO_INITIAL_VALUES');
  });
}
