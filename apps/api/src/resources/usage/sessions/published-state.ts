import { ResourceUsageAction } from '@attraccess/application-models';

/** The state of a session that is visible and usable: started as a usage, finalized, not a pending reservation. */
export const publishedState = {
  usageAction: ResourceUsageAction.Usage,
  isFinalized: true,
  lifecyclePending: false,
} as const;
