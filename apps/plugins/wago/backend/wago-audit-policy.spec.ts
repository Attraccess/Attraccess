import { validatePluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { WAGO_AUDIT_DOMAIN } from './wago-audit-policy';
import { WAGO_PRESETS } from './configuration';

describe('WAGO audit domain declaration', () => {
  it('satisfies the host audit domain contract', () => {
    expect(() => validatePluginAuditDomainDeclaration(WAGO_AUDIT_DOMAIN)).not.toThrow();
  });

  it('declares the wago domain with localized labels', () => {
    expect(WAGO_AUDIT_DOMAIN.domain).toBe('wago');
    expect(WAGO_AUDIT_DOMAIN.labels).toEqual({ en: 'WAGO controllers', de: 'WAGO-Controller' });
  });

  it('declares every controller action with the controller subject and no undeclared actions', () => {
    const actions = WAGO_AUDIT_DOMAIN.actions.map((entry) => entry.action);
    for (const action of [
      'wago.claim',
      'wago.unclaim',
      'wago.credential_rotation',
      'wago.manual_credential_fallback',
      'wago.publication',
      'wago.forced_publication',
      'wago.rollback',
      'wago.rejection_acknowledgement',
      'wago.preset_application',
      'wago.preset_reapplication',
      'wago.profile_creation',
      'wago.profile_change',
      'wago.manual_command',
    ])
      expect(actions).toContain(action);
    expect(actions).toHaveLength(22);
  });

  it('declares every commissioning action with the commissioning subject', () => {
    const commissioning = WAGO_AUDIT_DOMAIN.actions.filter((entry) =>
      entry.action.startsWith('wago.commissioning.'),
    );
    expect(commissioning.map((entry) => entry.action)).toEqual(
      [
        'install',
        'recover',
        'security_inspect',
        'security_review',
        'security_apply',
        'security_recover',
        'platform_inspect',
        'platform_activate',
        'platform_recover',
      ].map((action) => `wago.commissioning.${action}`),
    );
    for (const entry of commissioning) {
      expect(entry.subjectTypes).toEqual(['wago.commissioning']);
      expect(entry.details ?? {}).toEqual({});
    }
  });

  it('binds preset identifiers to the shipped preset catalog', () => {
    const presetApplication = WAGO_AUDIT_DOMAIN.actions.find((entry) => entry.action === 'wago.preset_application');
    expect(presetApplication?.details?.presetId).toEqual({
      type: 'string',
      oneOf: WAGO_PRESETS.map((preset) => preset.id),
    });
  });

  it('allows only identifier-shaped detail fields, never names or payloads', () => {
    const allowed = new Set(
      WAGO_AUDIT_DOMAIN.actions.flatMap((entry) => Object.keys(entry.details ?? {})),
    );
    expect([...allowed].sort()).toEqual(
      [
        'after.logicalChannelCount',
        'after.physicalPointCount',
        'before.logicalChannelCount',
        'before.physicalPointCount',
        'channelId',
        'commandId',
        'operation',
        'presetId',
        'profileId',
        'profileVersion',
        'result',
        'revision',
        'sourceRevision',
      ].sort(),
    );
  });
});
