import { AlertInstance, AlertingStack, SHIPPED_RULES, eventually, scaledRules } from './alerting-stack.test-fixture';

// The balena backup sidecar (docker/backup) writes these metrics to backup.prom; node-exporter publishes them.
const BACKUP_ALERTS = ['BackupNotConfigured', 'BackupFailed', 'BackupTooOld', 'BackupsDisabled'] as const;
type BackupAlert = (typeof BACKUP_ALERTS)[number];

describe('backup alerts against real Prometheus and Grafana', () => {
  let stack: AlertingStack;
  const now = () => Math.floor(Date.now() / 1000);
  const state = async (alert: BackupAlert) => (await stack.instances(alert))[0] as AlertInstance | undefined;
  const states = async () => {
    const result: Partial<Record<BackupAlert, string>> = {};
    for (const alert of BACKUP_ALERTS) result[alert] = (await state(alert))?.state ?? 'none';
    return result;
  };
  /** Waits until Grafana has evaluated every backup rule after the given time, so a quiet state is a real result. */
  const evaluatedSince = (since: number) =>
    eventually(
      async () => {
        for (const alert of BACKUP_ALERTS) if (!(await stack.evaluatedSince(alert, since))) return false;
        return true;
      },
      (done) => done,
      120,
    );
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
    await evaluatedSince(Date.now());
    expect(Object.values(await states()).every((s) => s !== 'Alerting')).toBe(true);
    stack.setBackupMetrics(healthy());
    await eventually(
      () => stack.query('backup_last_run_success'),
      (v) => v === 1,
      60,
    );
    await evaluatedSince(Date.now());
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

  it('uses the allowed age the sidecar reports (BACKUP_MAX_AGE_HOURS)', async () => {
    stack.setBackupMetrics({
      ...healthy(),
      backup_max_age_seconds: 48 * 3600,
      backup_last_success_timestamp_seconds: now() - 31 * 3600,
    });
    await eventually(
      () => stack.query('backup_max_age_seconds'),
      (v) => v === 48 * 3600,
      60,
    );
    await evaluatedSince(Date.now());
    await onlyFiring();
    stack.setBackupMetrics({
      ...healthy(),
      backup_max_age_seconds: 2 * 3600,
      backup_last_success_timestamp_seconds: now() - 3 * 3600,
    });
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
