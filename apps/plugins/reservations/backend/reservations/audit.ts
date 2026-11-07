import type {
  PluginAuditContext,
  PluginAuditReceipt,
  PluginAuditDomainDeclaration,
  PluginAuditPrincipal,
} from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';

export type ReservationAuditAction =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'ended_early'
  | 'no_show'
  | 'expired'
  | 'override_start'
  | 'settings_changed'
  | 'feed_created'
  | 'feed_revoked';

const RETRY_DELAYS_MS = [0, 100, 300, 800] as const;

export type AuditSubject = 'reservation' | 'resource' | 'feed' | 'global';
export type AuditDetails = Record<string, string | number | boolean | null>;

const reservationDetails = {
  resourceId: { type: 'number', integer: true, min: 1 },
  holderUserId: { type: 'number', integer: true, min: 1 },
  byManager: { type: 'boolean' },
  reason: { type: 'string', maxLength: 500 },
  bulk: { type: 'boolean' },
} as const;

const reservationAction = (action: ReservationAuditAction) => ({
  action: `reservations.${action}`,
  subjectTypes: ['reservations.reservation'],
  details: reservationDetails,
});

/** Registered through `PluginBackendModule.auditDomains`; the host rejects anything not declared here. */
export const RESERVATIONS_AUDIT_DOMAIN: PluginAuditDomainDeclaration = {
  domain: 'reservations',
  labels: { en: 'Reservations', de: 'Reservierungen' },
  actions: [
    reservationAction('created'),
    reservationAction('approved'),
    reservationAction('rejected'),
    reservationAction('cancelled'),
    reservationAction('ended_early'),
    reservationAction('no_show'),
    reservationAction('expired'),
    reservationAction('override_start'),
    {
      action: 'reservations.settings_changed',
      subjectTypes: ['reservations.resource', 'reservations.global'],
      details: {
        enabled: { type: 'boolean' },
        changedFields: { type: 'string', pattern: '[a-zA-Z0-9,]{0,400}', maxLength: 400 },
        cancelledBookings: { type: 'number', integer: true, min: 0 },
      },
    },
    {
      action: 'reservations.feed_created',
      subjectTypes: ['reservations.feed'],
      details: { feedName: { type: 'string', maxLength: 120 } },
    },
    {
      action: 'reservations.feed_revoked',
      subjectTypes: ['reservations.feed'],
      details: { feedName: { type: 'string', maxLength: 120 } },
    },
  ],
};

/** Best-effort audit writer: a failing audit backend never fails the user's action. */
export class ReservationAudit {
  constructor(
    private readonly audit: PluginAuditContext | undefined,
    private readonly logger?: { warn(message: string): void },
  ) {}

  /** Principal for scheduler-driven actions without a request (attributed to the affected user). */
  static systemPrincipal(userId: number): PluginAuditPrincipal {
    return { userId, authenticationMethod: 'session' };
  }

  async record(
    action: ReservationAuditAction,
    principal: PluginAuditPrincipal,
    subject: { type: AuditSubject; id: number },
    details: AuditDetails = {},
  ): Promise<void> {
    if (!this.audit) return;
    // The host validates detail values against the declared types, and a null never matches one: leave empty
    // details out instead of losing the whole entry.
    const operationId = randomUUID();
    const present = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== null && value !== undefined),
    );
    try {
      // The host's audit store gives up after a few milliseconds when SQLite is busy and answers `unavailable`:
      // that is transient, so try again a few times before giving up.
      let receipt: PluginAuditReceipt | undefined;
      for (const delayMs of RETRY_DELAYS_MS) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        receipt = await this.audit.record({
          action: `reservations.${action}`,
          operationId,
          principal,
          outcome: 'succeeded',
          subject: { type: `reservations.${subject.type}`, id: subject.id },
          details: present,
        });
        if (receipt?.status === 'recorded') return;
      }
      this.logger?.warn(`audit ${action} was not recorded (${receipt?.status})`);
    } catch (error) {
      this.logger?.warn(`audit ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
