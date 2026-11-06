import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOIDCConfigurationDto, UpdateSAMLConfigurationDto } from './update-provider.dto';
import { CreateOIDCConfigurationDto, CreateSAMLConfigurationDto } from './create-provider.dto';

const errorsFor = async (cls: new () => object, body: object) =>
  (await validate(plainToInstance(cls, body))).filter((e) => e.property === Object.keys(body)[0]);

describe('role claim path validation', () => {
  it.each([
    [undefined],
    [null],
    [[]],
    [['roles']],
    [Array.from({ length: 20 }, (_, i) => `claim${i}`)],
    [['a'.repeat(256)]],
    [['https://example.com/claims/roles', 'resource_access.my-client.roles', 'constructors']],
  ])('accepts %j', async (value) => {
    expect(await errorsFor(UpdateOIDCConfigurationDto, { roleClaimPaths: value })).toHaveLength(0);
    expect(await errorsFor(UpdateSAMLConfigurationDto, { roleAttributeKeys: value })).toHaveLength(0);
  });

  it.each([
    ['too many entries', Array.from({ length: 21 }, (_, i) => `claim${i}`)],
    ['entry too long', ['a'.repeat(257)]],
    ['entry with a comma', ['a,b']],
    ['blank entry', ['  ']],
    ['entry with surrounding whitespace', [' roles']],
    ['entry with a newline', ['groups\nrealm_access.roles']],
    ['entry with a tab', ['roles\t']],
    ['__proto__ segment', ['__proto__']],
    ['constructor segment', ['constructor.name']],
    ['prototype segment', ['roles.prototype']],
    ['non-string entry', [1]],
    ['not an array', 'roles'],
  ])('rejects %s', async (_name, value) => {
    expect(await errorsFor(UpdateOIDCConfigurationDto, { roleClaimPaths: value })).toHaveLength(1);
    expect(await errorsFor(CreateOIDCConfigurationDto, { roleClaimPaths: value })).toHaveLength(1);
    expect(await errorsFor(UpdateSAMLConfigurationDto, { roleAttributeKeys: value })).toHaveLength(1);
  });
});

describe('stored list validation (scopes, signing algorithms, username/email paths, SAML email keys)', () => {
  const fields: [new () => object, string][] = [
    [CreateOIDCConfigurationDto, 'scopes'],
    [CreateOIDCConfigurationDto, 'signingAlgorithms'],
    [CreateOIDCConfigurationDto, 'usernameClaimPaths'],
    [CreateOIDCConfigurationDto, 'emailClaimPaths'],
    [UpdateOIDCConfigurationDto, 'scopes'],
    [UpdateOIDCConfigurationDto, 'signingAlgorithms'],
    [UpdateOIDCConfigurationDto, 'usernameClaimPaths'],
    [UpdateOIDCConfigurationDto, 'emailClaimPaths'],
    [UpdateSAMLConfigurationDto, 'emailAttributeKeys'],
    [CreateSAMLConfigurationDto, 'emailAttributeKeys'],
  ];

  it.each(fields)('%p.%s accepts null, empty and long lists', async (cls, field) => {
    for (const value of [undefined, null, [], ['a', 'b'], Array.from({ length: 50 }, (_, i) => `entry${i}`)]) {
      expect(await errorsFor(cls, { [field]: value })).toHaveLength(0);
    }
  });

  it.each(fields)('%p.%s rejects commas, control characters, blank or untrimmed entries', async (cls, field) => {
    for (const value of [['a,b'], ['bad\u0007'], [''], ['  '], [' padded'], [1], 'roles']) {
      expect(await errorsFor(cls, { [field]: value })).toHaveLength(1);
    }
  });
});
