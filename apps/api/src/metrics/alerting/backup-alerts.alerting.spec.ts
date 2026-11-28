import { AlertInstance, AlertingStack, SHIPPED_RULES, scaledRules } from './alerting-stack.test-fixture';

// The balena backup sidecar (docker/backup) writes these metrics to backup.prom; node-exporter publishes them.
const BACKUP_ALERTS = ['BackupNotConfigured', 'BackupFailed', 'BackupTooOld', 'BackupsDisabled'] as const;
type BackupAlert = (typeof BACKUP_ALERTS)[number];

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

describe('backup alerts against real Prometheus and Grafana', () => {
  let stack: AlertingStack;
  const now = () => Math.floor(Date.now() / 1000);
  const state = async (alert: BackupAlert) => (await stack.instances(alert))[0] as AlertInstance | undefined;
  const states = async () => {
    const result: Partial<Record<BackupAlert, string>> = {};
    for (const alert of BACKUP_ALERTS) result[alert] = (await state(alert))?.state ?? 'none';
    return result;
  };
  /** Waits until exactly the given alerts fire and every other backup alert is quiet. */
  const onlyFiring = (...firing: BackupAlert[]) =>
    eventually(states, (s) => BACKUP_ALERTS.every((a) => (s[a] === 'Alerting') === firing.includes(a)), 120);
  const healthy = () => ({
    backup_configured: 1,
    backup_disabled: 0,
    backup_max_age_seconds: 30 * 3600,
    backup_scheduler_start_timestamp_seconds: now() - 3 * 86400,
    backup_last_run_timestamp_seconds: now() - 3600,
    backup_last_run_success: 1,
    backup_last_success_timestamp_seconds: now() - 3600,
  });

  beforeAll(async () => {
    // Only the evaluation interval is shortened; the backup rules have no pending period.
    stack = await AlertingStack.start(scaledRules(SHIPPED_RULES, '90s', '10s'));
  });

  afterAll(async () => {
    await stack?.stop();
  });

  it('stays quiet without backup metrics (stacks without the sidecar) and with a recent successful backup', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    expect(Object.values(await states()).every((s) => s !== 'Alerting')).toBe(true);
    stack.setBackupMetrics(healthy());
    await eventually(
      () => stack.query('backup_last_run_success'),
      (v) => v === 1,
      60,
    );
    await new Promise((resolve) => setTimeout(resolve, 20000));
    await onlyFiring();
  });

  it('fires BackupFailed when the last run failed, and clears after a successful run', async () => {
    stack.setBackupMetrics({ ...healthy(), backup_last_run_success: 0, backup_last_run_timestamp_seconds: now() });
    await onlyFiring('BackupFailed');
    stack.setBackupMetrics(healthy());
    await onlyFiring();
  });

  it('fires BackupTooOld when the last success is older than the allowed age', async () => {
    stack.setBackupMetrics({ ...healthy(), backup_last_success_timestamp_seconds: now() - 31 * 3600 });
    await onlyFiring('BackupTooOld');
  });

  it('fires BackupTooOld when no backup ever succeeded since the scheduler started too long ago', async () => {
    const metrics: Record<string, number> = healthy();
    delete metrics['backup_last_success_timestamp_seconds'];
    delete metrics['backup_last_run_success'];
    delete metrics['backup_last_run_timestamp_seconds'];
    stack.setBackupMetrics(metrics);
    await onlyFiring('BackupTooOld');
    stack.setBackupMetrics({ ...metrics, backup_scheduler_start_timestamp_seconds: now() - 60 });
    await onlyFiring();
  });

  it('fires BackupNotConfigured while the sidecar refuses to start', async () => {
    stack.setBackupMetrics({ backup_configured: 0 });
    await onlyFiring('BackupNotConfigured');
  });

  it('fires only BackupsDisabled when backups are switched off on purpose', async () => {
    // Old history stays in the file; it must not raise BackupTooOld while backups are disabled.
    stack.setBackupMetrics({
      backup_disabled: 1,
      backup_last_success_timestamp_seconds: now() - 10 * 86400,
      backup_last_run_success: 1,
    });
    await onlyFiring('BackupsDisabled');
  });
});
