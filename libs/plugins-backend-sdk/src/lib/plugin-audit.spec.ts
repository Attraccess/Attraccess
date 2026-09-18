import {
  PluginAuditDomainDeclaration,
  PLUGIN_AUDIT_LIMITS,
  validatePluginAuditDomainDeclaration,
} from './plugin-audit';

const declaration = (overrides: Partial<PluginAuditDomainDeclaration> = {}): PluginAuditDomainDeclaration => ({
  domain: 'demo',
  actions: [
    {
      action: 'demo.publish',
      subjectTypes: ['demo.device'],
      details: {
        revision: { type: 'number' as const, integer: true, min: 1 },
        profileId: { type: 'string' as const, maxLength: 160, pattern: '^\\S(?:.*\\S)?$' },
        mode: { type: 'string' as const, oneOf: ['set', 'pulse'] },
        'before.pointCount': { type: 'number' as const, integer: true, min: 0 },
        flagged: { type: 'boolean' as const },
      },
    },
    { action: 'demo.commissioning.install', subjectTypes: ['demo.commissioning'] },
  ],
  ...overrides,
});

describe('validatePluginAuditDomainDeclaration', () => {
  it('accepts a well-formed declaration and returns it unchanged', () => {
    const input = declaration();
    expect(validatePluginAuditDomainDeclaration(input)).toBe(input);
  });

  it('accepts localized labels', () => {
    expect(() =>
      validatePluginAuditDomainDeclaration(declaration({ labels: { en: 'Demo devices', de: 'Demo-Geräte' } })),
    ).not.toThrow();
  });

  it.each([
    ['missing domain', declaration({ domain: undefined as never })],
    ['uppercase domain', declaration({ domain: 'Demo' })],
    ['domain with digits', declaration({ domain: 'demo2' })],
    ['domain with hyphen', declaration({ domain: 'demo-device' })],
    ['empty domain', declaration({ domain: '' })],
  ])('rejects %s', (_label, input) => {
    expect(() => validatePluginAuditDomainDeclaration(input)).toThrow();
  });

  it('rejects a domain longer than 32 characters', () => {
    const actions = (domain: string) => [{ action: `${domain}.publish`, subjectTypes: [`${domain}.device`] }];
    expect(() =>
      validatePluginAuditDomainDeclaration(declaration({ domain: 'd'.repeat(33), actions: actions('d'.repeat(33)) })),
    ).toThrow();
    expect(() =>
      validatePluginAuditDomainDeclaration(declaration({ domain: 'd'.repeat(32), actions: actions('d'.repeat(32)) })),
    ).not.toThrow();
  });

  it.each([
    ['actions missing', declaration({ actions: undefined as never })],
    ['actions empty', declaration({ actions: [] })],
    ['action without domain prefix', declaration({ actions: [{ action: 'publish', subjectTypes: ['demo.device'] }] })],
    [
      'action with foreign domain prefix',
      declaration({ actions: [{ action: 'other.publish', subjectTypes: ['demo.device'] }] }),
    ],
    [
      'action with uppercase segment',
      declaration({ actions: [{ action: 'demo.Publish', subjectTypes: ['demo.device'] }] }),
    ],
    [
      'subject type without domain prefix',
      declaration({ actions: [{ action: 'demo.publish', subjectTypes: ['device'] }] }),
    ],
    ['subject types empty', declaration({ actions: [{ action: 'demo.publish', subjectTypes: [] }] })],
    [
      'duplicate actions',
      declaration({
        actions: [
          { action: 'demo.publish', subjectTypes: ['demo.device'] },
          { action: 'demo.publish', subjectTypes: ['demo.device'] },
        ],
      }),
    ],
    [
      'duplicate subject types',
      declaration({ actions: [{ action: 'demo.publish', subjectTypes: ['demo.device', 'demo.device'] }] }),
    ],
    [
      'unknown action property',
      declaration({ actions: [{ action: 'demo.publish', subjectTypes: ['demo.device'], extra: 1 } as never] }),
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => validatePluginAuditDomainDeclaration(input)).toThrow();
  });

  it('rejects more actions than the per-domain limit', () => {
    const actions = Array.from({ length: PLUGIN_AUDIT_LIMITS.actionsPerDomain + 1 }, (_, index) => ({
      action: `demo.action_${index}`,
      subjectTypes: ['demo.device'],
    }));
    expect(() => validatePluginAuditDomainDeclaration(declaration({ actions }))).toThrow();
  });

  it.each([
    ['uppercase field name', { Revision: { type: 'number' as const } }],
    ['field starting with a dot', { '.revision': { type: 'number' as const } }],
    ['unknown policy property', { revision: { type: 'number' as const, regex: 'x' } }],
    ['missing field type', { revision: {} }],
    ['invalid field type', { revision: { type: 'integer' } }],
    ['pattern on a number', { revision: { type: 'number' as const, pattern: '^1$' } }],
    ['invalid pattern', { revision: { type: 'string' as const, pattern: '(' } }],
    ['oneOf with mixed types', { revision: { type: 'number' as const, oneOf: [1, 'two'] } }],
    ['oneOf empty', { revision: { type: 'number' as const, oneOf: [] } }],
    ['min on a string', { revision: { type: 'string' as const, min: 1 } }],
    ['integer on a string', { revision: { type: 'string' as const, integer: true } }],
    ['maxLength on a number', { revision: { type: 'number' as const, maxLength: 10 } }],
    ['maxLength above ceiling', { revision: { type: 'string' as const, maxLength: 5000 } }],
  ])('rejects detail field %s', (_label, details) => {
    expect(() =>
      validatePluginAuditDomainDeclaration(
        declaration({
          actions: [{ action: 'demo.publish', subjectTypes: ['demo.device'], details: details as never }],
        }),
      ),
    ).toThrow();
  });

  it.each([
    ['empty label', { en: '' }],
    ['blank label', { en: '   ' }],
    ['non-string label', { en: 42 as never }],
    ['invalid locale key', { english: 'Demo' }],
  ])('rejects %s', (_label, labels) => {
    expect(() => validatePluginAuditDomainDeclaration(declaration({ labels: labels as never }))).toThrow();
  });

  it('accepts a plain-object prototype check', () => {
    const hostile = Object.create({ domain: 'demo', actions: [] });
    expect(() => validatePluginAuditDomainDeclaration(hostile)).toThrow();
  });
});
