import { validatePluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { RESERVATIONS_AUDIT_DOMAIN, ReservationAudit } from './audit';

describe('reservations audit domain', () => {
  it('is a valid host declaration with the eleven actions', () => {
    expect(() => validatePluginAuditDomainDeclaration(RESERVATIONS_AUDIT_DOMAIN)).not.toThrow();
    expect(RESERVATIONS_AUDIT_DOMAIN.actions.map((a) => a.action)).toEqual(
      [
        'created',
        'approved',
        'rejected',
        'cancelled',
        'ended_early',
        'no_show',
        'expired',
        'override_start',
        'settings_changed',
        'feed_created',
        'feed_revoked',
      ].map((name) => `reservations.${name}`),
    );
  });

  it('never fails the caller when the audit backend fails', async () => {
    const warn = jest.fn();
    const audit = new ReservationAudit({ record: jest.fn().mockRejectedValue(new Error('down')) }, { warn });
    await expect(
      audit.record('created', { userId: 1, authenticationMethod: 'session' }, { type: 'reservation', id: 1 }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
