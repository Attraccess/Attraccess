import { isPluginAuditSystemPrincipal, PLUGIN_AUDIT_SYSTEM_PRINCIPAL } from './plugin-audit';

describe('plugin audit system principal', () => {
  it('is a frozen { kind: "system" } that the guard recognises', () => {
    expect(PLUGIN_AUDIT_SYSTEM_PRINCIPAL).toEqual({ kind: 'system' });
    expect(Object.isFrozen(PLUGIN_AUDIT_SYSTEM_PRINCIPAL)).toBe(true);
    expect(isPluginAuditSystemPrincipal(PLUGIN_AUDIT_SYSTEM_PRINCIPAL)).toBe(true);
  });

  it('does not treat a user principal or nothing as the system', () => {
    expect(isPluginAuditSystemPrincipal({ userId: 1, authenticationMethod: 'session' })).toBe(false);
    expect(isPluginAuditSystemPrincipal(null)).toBe(false);
    expect(isPluginAuditSystemPrincipal(undefined)).toBe(false);
  });
});
