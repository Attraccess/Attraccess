import type { TFunction } from '@attraccess/plugins-frontend-ui';

export const options = <T extends string>(values: readonly T[], t: TFunction) =>
  values.map((id) => ({ id, label: t(`channels.${id}`) }));
