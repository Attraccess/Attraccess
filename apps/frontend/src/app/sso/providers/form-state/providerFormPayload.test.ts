import { describe, expect, it } from 'vitest';
import { buildOidcPayload, buildSamlPayload } from './providerFormPayload';

type FormValues = Parameters<typeof buildOidcPayload>[0]['formValues'];

describe('name claim paths in the provider payload', () => {
  it('trims OIDC claim paths and sends blank ones as null', () => {
    const payload = buildOidcPayload({
      formValues: {
        name: 'p',
        type: 'oidc',
        oidcConfiguration: { firstNameClaimPath: ' given_name ', lastNameClaimPath: '  ' },
      } as unknown as FormValues,
      scopes: [],
      usernameClaimPaths: [],
      emailClaimPaths: [],
      roleClaimPaths: [],
      oidcRoleMappingEntries: [],
      isEditing: false,
      providerDetails: undefined,
    });
    expect(payload.firstNameClaimPath).toBe('given_name');
    expect(payload.lastNameClaimPath).toBeNull();
  });

  it('trims SAML attribute names and sends blank ones as null', () => {
    const payload = buildSamlPayload({
      formValues: {
        name: 'p',
        type: 'saml',
        samlConfiguration: { firstNameClaimPath: '', lastNameClaimPath: ' surname ' },
      } as unknown as FormValues,
      emailAttributeKeys: [],
      roleAttributeKeys: [],
      samlRoleMappingEntries: [],
      isEditing: false,
      providerDetails: undefined,
    });
    expect(payload.firstNameClaimPath).toBeNull();
    expect(payload.lastNameClaimPath).toBe('surname');
  });
});
