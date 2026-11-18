import type { SupervisionMode } from '@attraccess/application-models';

/** A usage session store that only knows the supervision modes a spec's old resource lookup returned. */
export const supervisionModesFrom = (
  find: (options: unknown) => Promise<{ id: number; supervisionMode?: SupervisionMode }[]>,
) => ({
  findSupervisionModes: async (ids: number[]) =>
    new Map(
      (await find({ where: { id: { _value: ids } } })).map((resource) => [resource.id, resource.supervisionMode]),
    ),
});
