import type { PluginAuditFieldPolicy } from '@attraccess/plugins-backend-sdk';
import { MATTER_AUDIT_DOMAIN } from '../connection/audit';
import {
  createCommissioningHarness,
  sidecarSession,
  type CommissioningHarness,
} from '../testing/commissioning-harness.test-utils';

const USER = { userId: 7, authenticationMethod: 'session' as const };
type Event = {
  action: string;
  subject: { type: string; id: number };
  details: Record<string, string | number | boolean>;
};

function matches(policy: PluginAuditFieldPolicy, value: string | number | boolean): boolean {
  if (typeof value !== policy.type) return false;
  if (policy.oneOf && !(policy.oneOf as readonly unknown[]).includes(value)) return false;
  if (policy.pattern && !new RegExp(`^(?:${policy.pattern})$`).test(String(value))) return false;
  if (typeof value === 'string' && policy.maxLength !== undefined && value.length > policy.maxLength) return false;
  if (typeof value === 'number') {
    if (policy.integer && !Number.isInteger(value)) return false;
    if (policy.min !== undefined && value < policy.min) return false;
    if (policy.max !== undefined && value > policy.max) return false;
  }
  return true;
}

describe('every commissioning audit entry fits the declared audit policy', () => {
  let h: CommissioningHarness;
  beforeEach(async () => {
    h = await createCommissioningHarness();
  });
  afterEach(() => h.close());

  it('records declared actions, subjects and bounded details across a commission, a failure, a removal and a share', async () => {
    const sidecar = { current: sidecarSession({ attestationOverrideAllowed: true }) };
    h.connection.handlers['commissioning.start'] = () => sidecar.current;
    h.connection.handlers['commissioning.get'] = () => sidecar.current;
    h.audit.mockClear();
    // An overridden commission, named afterwards.
    const view = await h.commissioning.start(
      { setupCode: '34970112332', attestationOverride: { confirmed: true } },
      USER,
    );
    h.sidecarCommissions('5');
    sidecar.current = {
      ...sidecar.current,
      state: 'succeeded',
      step: 'completed',
      nodeId: '5',
      attestation: { status: 'overridden', findings: ['PaaNotTrusted', 'CertificationTypeTest'] },
    };
    await h.waitFor(() => h.commissioning.get(view.id, 7).state === 'succeeded');
    await h.commissioning.finish(view.id, 7, { displayName: 'x', location: 'y' });
    // A failure and an interruption.
    sidecar.current = sidecarSession();
    const second = await h.commissioning.start({ setupCode: '34970112332' }, USER);
    sidecar.current = {
      ...sidecar.current,
      state: 'failed',
      failure: { code: 'attestation_failed', attestationFindings: ['PaaNotTrusted'] },
    };
    await h.waitFor(() => h.commissioning.get(second.id, 7).state === 'failed');
    sidecar.current = sidecarSession();
    const third = await h.commissioning.start({ setupCode: '34970112332' }, USER);
    h.connection.setState('degraded');
    await h.waitFor(() => h.commissioning.get(third.id, 7).state === 'interrupted');
    h.connection.setState('connected');
    // Removal, a failed removal and sharing.
    const node = (await h.tables.nodes.findOne())?.id as string;
    h.connection.handlers['nodes.share.open'] = () => ({
      nodeId: '5',
      manualCode: '36217551633',
      qrCode: 'MT:Y.K9042C00KA0648G00',
      expiresAt: new Date(Date.now() + 20).toISOString(),
    });
    h.connection.handlers['nodes.share.revoke'] = () => ({ nodeId: '5', closed: true });
    await h.sharing.open(node, { timeoutSec: 900 }, USER);
    await h.waitFor(() => h.actions().includes('matter.node_share_expired'));
    await h.sharing.revoke(node, USER);
    h.connection.handlers['nodes.remove'] = () => ({ nodeId: '5', result: 'removed_from_fabric', fabricGeneration: 9 });
    await h.removal.remove(node, { mode: 'normal', confirm: true }, USER);

    const events = h.audit.mock.calls.map((call) => (call as unknown as [Event])[0]);
    expect(new Set(events.map((event) => event.action))).toEqual(
      new Set([
        'matter.commissioning_started',
        'matter.commissioning_attestation_overridden',
        'matter.node_commissioned',
        'matter.commissioning_finished',
        'matter.commissioning_failed',
        'matter.commissioning_interrupted',
        'matter.node_shared',
        'matter.node_share_expired',
        'matter.node_share_revoked',
        'matter.node_removed_from_fabric',
      ]),
    );
    for (const event of events) {
      const action = MATTER_AUDIT_DOMAIN.actions.find((candidate) => candidate.action === event.action);
      expect(action?.subjectTypes).toContain(event.subject.type);
      for (const [name, value] of Object.entries(event.details)) {
        const policy = action?.details?.[name];
        expect(policy).toBeDefined();
        expect(matches(policy as PluginAuditFieldPolicy, value)).toBe(true);
      }
    }
    const everything = JSON.stringify(events);
    expect(everything).not.toContain('34970112332');
    expect(everything).not.toContain('36217551633');
    expect(everything).not.toContain('MT:');
  });
});
