import { describe, expect, it } from 'vitest';
import type { SsoProvider } from '@attraccess/react-query-client';
import { oidcFormValues, samlFormValues } from './providerFormValues';

describe('name claim paths when a stored provider is edited', () => {
  it('loads the stored OIDC claim paths into the form, so saving does not wipe them', () => {
    const values = oidcFormValues({
      firstNameClaimPath: 'custom.given',
      lastNameClaimPath: 'custom.family',
    } as NonNullable<SsoProvider['oidcConfiguration']>);
    expect(values).toMatchObject({ firstNameClaimPath: 'custom.given', lastNameClaimPath: 'custom.family' });
  });

  it('shows empty fields when no claim path is stored', () => {
    const values = oidcFormValues({ firstNameClaimPath: null } as NonNullable<SsoProvider['oidcConfiguration']>);
    expect(values).toMatchObject({ firstNameClaimPath: '', lastNameClaimPath: '' });
  });

  it('loads the stored SAML attribute names into the form', () => {
    const values = samlFormValues({
      firstNameClaimPath: 'first',
      lastNameClaimPath: 'last',
    } as NonNullable<SsoProvider['samlConfiguration']>);
    expect(values).toMatchObject({ firstNameClaimPath: 'first', lastNameClaimPath: 'last' });
  });
});
