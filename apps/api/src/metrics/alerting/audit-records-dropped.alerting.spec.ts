import { AlertInstance, AlertingStack, SHIPPED_RULES, scaledRules } from './alerting-stack.test-fixture';

const ALERT = 'AuditRecordsDropped';

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, seconds: number): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    value = await read();
  }
  return value;
}

describe('AuditRecordsDropped alert against real Prometheus and Grafana', () => {
  let stack: AlertingStack;
  const state = async () => (await stack.instances(ALERT))[0] as AlertInstance | undefined;
  const notified = (status: string) =>
    stack.notifications.filter((n) => n.alertname === ALERT && n.status === status);

  beforeAll(async () => {
    // Only the evaluation interval is shortened; the audit rule has no pending period.
    stack = await AlertingStack.start(scaledRules(SHIPPED_RULES, '90s', '10s'));
    await eventually(() => stack.targetsUp(), (up) => up === 2, 60);
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('stays quiet while no audit record was dropped', async () => {
    await eventually(
      () => stack.query('sum(attraccess_audit_records_dropped_total{job="attraccess"})'),
      (total) => total === 0,
      60,
    );
    // Several evaluations pass with the counter at zero.
    await new Promise((resolve) => setTimeout(resolve, 30000));
    expect((await state())?.state).toBe('Normal');
    expect(notified('firing')).toEqual([]);
  });

  it('fires on the first dropped record without a pending wait and notifies', async () => {
    stack.dropAuditRecords('resource', 'storage_error');

    await eventually(state, (i) => i?.state === 'Alerting', 120);
    await eventually(async () => notified('firing'), (n) => n.length > 0, 60);
    expect(notified('firing')[0].title).toContain('FIRING');
  });
});
