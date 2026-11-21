import { resolveOidcNameClaims, resolveSamlNameClaims } from './sso-name-claims';

describe('resolveOidcNameClaims', () => {
  it('reads given_name and family_name from the claim sources by default', () => {
    expect(resolveOidcNameClaims([{}, { given_name: ' Ada ' }, { family_name: 'Lovelace' }], {})).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('reads the passport profile name as a fallback', () => {
    expect(resolveOidcNameClaims([{ name: { givenName: 'Ada', familyName: 'Lovelace' } }], {})).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('uses a configured path instead of the defaults', () => {
    const sources = [{ given_name: 'Default', custom: { first: 'Custom' } }];
    expect(resolveOidcNameClaims(sources, { firstNameClaimPath: 'custom.first' }).firstName).toBe('Custom');
    expect(resolveOidcNameClaims(sources, { firstNameClaimPath: 'missing' }).firstName).toBeUndefined();
  });

  it('treats blank and non-string claims as missing and clips long names', () => {
    expect(resolveOidcNameClaims([{ given_name: '  ', family_name: 5 }], {})).toEqual({
      firstName: undefined,
      lastName: undefined,
    });
    expect(resolveOidcNameClaims([{ given_name: 'x'.repeat(150) }], {}).firstName).toHaveLength(100);
  });

  it('drops control characters (NUL breaks a PostgreSQL write) and cuts by character, ending without whitespace', () => {
    expect(resolveOidcNameClaims([{ given_name: 'A\u0000da\n', family_name: '\u0000' }], {})).toEqual({
      firstName: 'Ada',
      lastName: undefined,
    });
    expect(resolveOidcNameClaims([{ given_name: '😀'.repeat(150) }], {}).firstName).toBe('😀'.repeat(100));
    expect(resolveOidcNameClaims([{ given_name: `${'x'.repeat(99)} tail` }], {}).firstName).toBe('x'.repeat(99));
  });
});

describe('resolveSamlNameClaims', () => {
  it('reads givenName and surname, also from the attribute bag and as claim URIs', () => {
    expect(resolveSamlNameClaims({ givenName: 'Ada', attributes: { surname: ['Lovelace'] } }, {})).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(
      resolveSamlNameClaims(
        {
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'Ada',
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Lovelace',
        },
        {},
      ),
    ).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('uses a configured attribute key instead of the defaults', () => {
    expect(resolveSamlNameClaims({ givenName: 'Default', gn: 'Custom' }, { firstNameClaimPath: 'gn' }).firstName).toBe(
      'Custom',
    );
  });
});
