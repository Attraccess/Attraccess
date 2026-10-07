import type { ManagementException } from './wago-management.types';
import { randomBytes } from 'node:crypto';
import type { ManagementState } from './wago-management.types';

export const exceptionNames: ManagementException[] = [
  'wbm_exposed',
  'other_services_exposed',
  'unqualified_privileges',
];

export const identifier = () => randomBytes(16).toString('hex');
export const LEASE_MS = 300000;

export const transitionStates: ManagementState[] = [
  'preparing',
  'installing_key',
  'verifying_key',
  'restricting_access',
  'verifying_baseline',
  'committing',
  'recovering',
  'recovery_required',
];
