import { AlertInstance, AlertingStack, SHIPPED_RULES, scaledRules } from './alerting-stack.test-fixture';

const CRASH = 'AttractapReaderCrashes';
const POWER_ON = 'AttractapReaderPowerOnResets';
// ALERTING_REAL_TIME=1 runs the shipped 5m wait and 1m evaluation unchanged (slow, run manually).
const REAL_TIME = process.env['ALERTING_REAL_TIME'] === '1';
const SLOW = REAL_TIME ? 8 : 1;
// 90s leaves room to observe Pending and change the reports before it fires, even when Grafana stalls.
const PENDING = REAL_TIME ? '5m' : '90s';
const INTERVAL = REAL_TIME ? '1m' : '10s';
// The real-time waits (up to 180s x 8) are longer than the 15-minute default per-test limit.
if (REAL_TIME) jest.setTimeout(30 * 60_000);

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

const reports = (reader: number, reason: string, n: number) => Array.from({ length: n }, () => ({ reader, reason }));

describe('reset-report alerts against real Prometheus and Grafana', () => {
  let stack: AlertingStack;
  const state = (name: string) => async () => (await stack.instances(name))[0] as AlertInstance | undefined;
  const hasState = (wanted: string) => (i: AlertInstance | undefined) => i?.state === wanted;
  const notified = (alertname: string, status: string) =>
    stack.notifications.filter((n) => n.alertname === alertname && n.status === status);
  // Only the two rules under test (plus anything unparsable); other shipped rules are loaded too.
  const resetNotifications = () =>
    stack.notifications.filter((n) => [CRASH, POWER_ON, 'unparsed'].includes(n.alertname));
  // Waits until Prometheus has scraped the new counts from both targets, so a quiet check is not vacuous.
  // max() and min() across the two targets must both equal the stored count; sum() would double it.
  const scraped = async (category: string, count: number) => {
    const metric = `last_over_time(attraccess_attractap_reset_reports_last_hour{job="attraccess", category="${category}"}[15s])`;
    const read = async () => [await stack.query(`max(${metric})`), await stack.query(`min(${metric})`)];
    await eventually(read, ([max, min]) => max === count && min === count, 60 * SLOW);
  };

  describe('with the shipped rules (time-scaled to a 90s wait and 10s evaluation unless ALERTING_REAL_TIME=1)', () => {
    beforeAll(async () => {
      stack = await AlertingStack.start(scaledRules(SHIPPED_RULES, PENDING, INTERVAL));
      // Two metrics servers share one database; max() must see both, or the no-double-count checks prove nothing.
      await eventually(() => stack.targetsUp(), (up) => up === 2, 60 * SLOW);
    });

    afterAll(async () => {
      await stack?.stop();
    });

    it('keeps three POWERON reports quiet and never uses crash wording', async () => {
      await stack.setReports(reports(1, 'POWERON', 3));
      await scraped('power_on', 3);
      await eventually(state(POWER_ON), hasState('Normal'), 60 * SLOW);
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
      // Let several evaluations pass: three reports must stay quiet.
      await new Promise((resolve) => setTimeout(resolve, 40000 * SLOW));
      expect((await state(POWER_ON)())?.state).toBe('Normal');
      expect((await state(CRASH)())?.state).toBe('Normal');
      expect(resetNotifications()).toEqual([]);
    });

    it('keeps two crash and two power-on reports quiet', async () => {
      await stack.setReports([...reports(1, 'PANIC', 2), ...reports(2, 'POWERON', 2)]);
      await scraped('crash_watchdog', 2);
      await scraped('power_on', 2);
      await eventually(state(POWER_ON), hasState('Normal'), 60 * SLOW);
      await new Promise((resolve) => setTimeout(resolve, 40000 * SLOW));
      expect((await state(POWER_ON)())?.state).toBe('Normal');
      expect((await state(CRASH)())?.state).toBe('Normal');
      expect(resetNotifications()).toEqual([]);
    });

    it('keeps the same wait when readers change while Pending', async () => {
      await stack.setReports([...reports(1, 'PANIC', 2), ...reports(2, 'TASK_WDT', 2)]);
      const before = await eventually(state(CRASH), hasState('Pending'), 60 * SLOW);
      await stack.setReports([...reports(3, 'WDT', 2), ...reports(1, 'PANIC', 2)]);
      const after = await eventually(state(CRASH), (i) => !!i?.description.includes('Gate (#3): WDT x2'), 60 * SLOW);
      expect(after?.state).toBe('Pending');
      expect(after?.activeAt).toBe(before?.activeAt);

      // Leave a quiet state, so the next scenario starts its own wait instead of inheriting this one.
      await stack.setReports([]);
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
    });

    it('cancels a Pending wait at three and starts a fresh wait on return to four', async () => {
      await stack.setReports(reports(1, 'PANIC', 4));
      const first = await eventually(state(CRASH), (i) => i?.state === 'Pending' && i.description.includes('Door (#1): PANIC x4'), 60 * SLOW);
      await stack.setReports(reports(1, 'PANIC', 3));
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
      expect(notified(CRASH, 'firing')).toHaveLength(0);
      expect(notified(CRASH, 'resolved')).toHaveLength(0);

      await stack.setReports(reports(1, 'PANIC', 4));
      const second = await eventually(state(CRASH), hasState('Pending'), 60 * SLOW);
      expect(Date.parse(second?.activeAt ?? '')).toBeGreaterThan(Date.parse(first?.activeAt ?? ''));
      expect(notified(CRASH, 'firing')).toHaveLength(0);

      // Leave a quiet state for the following scenarios.
      await stack.setReports([]);
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
    });

    it('goes Pending then Firing for four crash/watchdog reports, naming readers and reasons', async () => {
      await stack.setReports([...reports(1, 'PANIC', 2), ...reports(2, 'TASK_WDT', 2)]);
      const pending = await eventually(state(CRASH), hasState('Pending'), 60 * SLOW);
      expect(pending?.description).toContain('Door (#1): PANIC x2; Laser (#2): TASK_WDT x2');
      expect(notified(CRASH, 'firing')).toHaveLength(0);

      await eventually(state(CRASH), hasState('Alerting'), 120 * SLOW);
      await eventually(async () => notified(CRASH, 'firing'), (n) => n.length > 0, 60 * SLOW);
      const message = notified(CRASH, 'firing')[0].message;
      expect(message).toContain('four or more');
      expect(message).toContain('4 crash or watchdog reset reports');
      expect(message).toContain('Door (#1): PANIC x2; Laser (#2): TASK_WDT x2');
      expect(notified(CRASH, 'firing')[0].title).toContain('FIRING');
      expect((await state(POWER_ON)())?.state).toBe('Normal');
    });

    // The next scenarios continue from the Alerting state the previous one left behind.
    it('keeps the same wait when the contributing readers change', async () => {
      const before = await state(CRASH)();
      expect(before?.state).toBe('Alerting');
      await stack.setReports([...reports(3, 'WDT', 2), ...reports(1, 'INT_WDT', 2)]);
      const after = await eventually(
        state(CRASH),
        (i) => !!i?.description.includes('Gate (#3): WDT x2'),
        60 * SLOW,
      );
      expect(after?.state).toBe('Alerting');
      expect(after?.activeAt).toBe(before?.activeAt);
    });

    it('returns to Normal at three and starts a fresh wait on return to four', async () => {
      const firstActiveAt = (await state(CRASH)())?.activeAt;
      await stack.setReports(reports(1, 'PANIC', 3));
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
      await eventually(async () => notified(CRASH, 'resolved'), (n) => n.length > 0, 60 * SLOW);

      await stack.setReports(reports(1, 'PANIC', 4));
      const pending = await eventually(state(CRASH), hasState('Pending'), 60 * SLOW);
      expect(Date.parse(pending?.activeAt ?? '')).toBeGreaterThan(Date.parse(firstActiveAt ?? ''));
      const resolved = notified(CRASH, 'resolved')[0].message;
      expect(resolved).toContain('3 crash or watchdog reset reports');
      expect(resolved).toContain('fires at four or more');

      // Leave a quiet state for the power-on scenario.
      await stack.setReports([]);
      await eventually(state(CRASH), hasState('Normal'), 60 * SLOW);
    });

    it('sends only the power-on warning, with restart wording', async () => {
      const crashFirings = notified(CRASH, 'firing').length;
      await stack.setReports(reports(2, 'POWERON', 4));
      await eventually(async () => notified(POWER_ON, 'firing'), (n) => n.length > 0, 180 * SLOW);
      const { title, message } = notified(POWER_ON, 'firing')[0];
      expect(message).toContain('4 power-on reset reports');
      expect(message).toContain('does not confirm a reader fault');
      expect(message).toContain('Laser (#2): POWERON x4');
      expect(`${title}\n${message}`).not.toMatch(/crash/i);
      expect((await state(CRASH)())?.state).toBe('Normal');
      expect(notified(CRASH, 'firing')).toHaveLength(crashFirings);
    });

    // A database failure must surface as an outage, not as zero reports. Runs last: the database stays broken.
    it('reports a database failure through the availability alerts', async () => {
      await stack.breakDatabase();
      await eventually(() => stack.targetsUp(), (up) => up === 0, 60 * SLOW);
      // AttractapServiceDown keeps its shipped 2m wait; ScrapeFailures uses the shortened wait.
      for (const alertname of ['AttractapServiceDown', 'ScrapeFailures']) {
        await eventually(async () => notified(alertname, 'firing'), (n) => n.length > 0, 240 * SLOW);
      }
    });
  });
});
