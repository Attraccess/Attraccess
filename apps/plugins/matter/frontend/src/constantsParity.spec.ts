// The page keeps its own copies of a few backend and contract constants, so the bundle does not pull in the backend or
// zod. These checks fail when a copy drifts from its source (e.g. a new profile would otherwise show a raw key).
import { FEATURE_FAMILIES as CONTRACT_FAMILIES, SERVICE_TOKEN_PATTERN } from '@attraccess/matter-contract';
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_STATES as BACKEND_LIFECYCLE_STATES } from '../../backend/devices/constants';
import { PROFILES as BACKEND_PROFILES } from '../../backend/devices/profile';
import { FEATURE_FAMILIES } from './capabilities';
import { LIFECYCLE_STATES, PROFILES } from './devices/api';
import { SERVICE_TOKEN } from './settingsValidation';

describe('frontend copies of backend and contract constants', () => {
  it('has the contract feature families', () => expect(FEATURE_FAMILIES).toEqual(CONTRACT_FAMILIES));

  it('validates the token like the contract', () => {
    expect(SERVICE_TOKEN.source).toBe(SERVICE_TOKEN_PATTERN.source);
    expect(SERVICE_TOKEN.flags).toBe(SERVICE_TOKEN_PATTERN.flags);
  });

  it('has the backend lifecycle states', () => expect(LIFECYCLE_STATES).toEqual(BACKEND_LIFECYCLE_STATES));

  it('has the backend profiles', () => expect(PROFILES).toEqual(BACKEND_PROFILES));
});
