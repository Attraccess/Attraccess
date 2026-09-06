import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import type { WagoCommissioningClockReport } from '../shared/commissioning';

export const CLOCK_LIMITS = { timeoutMs: 30_000, maxOutputBytes: 4096 };
export const CLOCK_TOLERANCE_SECONDS = 5;
const MAX_SKEW_SECONDS = 10 * 366 * 86400;
// Owner-provided read-only FW31 cc100-clock-source.txt: config_clock source
// lines 203-207 document these UTC arguments; lines 331-345 check date/hwclock
// exits. The captured executable SHA-256 below pins this mutator contract.
const CLOCK_TOOL_SHA256 = 'b230f853745ced8f772579093b55af24826986378dcf4926cef67ae95c31d7c5';
const TOOL_CHECK = `test -x /etc/config-tools/config_clock && test -f /etc/config-tools/config_tool_lib && test "$(sha256sum /etc/config-tools/config_clock | cut -d ' ' -f 1)" = '${CLOCK_TOOL_SHA256}'`;
export const CLOCK_INSPECTION_SCRIPT = `set -eu
export LC_ALL=C
printf 'epoch=%s\\n' "$(/bin/date -u +%s)"
read uptime unused < /proc/uptime
printf 'uptime=%s\\n' "$uptime"
printf 'boot=%s\\n' "$(cat /proc/sys/kernel/random/boot_id)"
if ${TOOL_CHECK} && command -v timeout >/dev/null; then printf 'tool=supported\\n'; else printf 'tool=unsupported\\n'; fi
`;

type Sample = { epoch: number; uptime: number; boot: string; supported: boolean };
type Execute = (script: string, limits: typeof CLOCK_LIMITS) => Promise<string>;

function validEpoch(epoch: number): boolean {
  // FW31's 32-bit time boundary is deliberately not crossed.
  return Number.isSafeInteger(epoch) && epoch >= 1577836800 && epoch <= 2145916799;
}

function parseSample(output: string): Sample {
  const match =
    /^epoch=([0-9]{10})\nuptime=([0-9]{1,10}\.[0-9]{1,2})\nboot=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\ntool=(supported|unsupported)\n$/.exec(
      output,
    );
  if (!match || !validEpoch(Number(match[1]))) throw new Error('Invalid controller clock observation.');
  return {
    epoch: Number(match[1]),
    uptime: Math.floor(Number(match[2])),
    boot: match[3],
    supported: match[4] === 'supported',
  };
}

/** No browser/saved timestamps enter this operation; each attempt samples application UTC anew. */
export async function commissionClock(
  execute: Execute,
  confirmInstall: boolean,
  report: (value: WagoCommissioningClockReport) => Promise<void>,
  now = Date.now,
  monotonic = () => performance.now(),
): Promise<WagoCommissioningClockReport & { assertFresh: () => void }> {
  const started = monotonic();
  const hostStarted = now();
  let value: WagoCommissioningClockReport | undefined;
  const finish = () => {
    if (!value) throw new Error('Clock verification is unavailable.');
    const result = value;
    const assertFresh = () => {
      const age = now() - Date.parse(result.hostUtc);
      if (age < 0 || age > CLOCK_LIMITS.timeoutMs || Math.abs(now() - hostStarted - (monotonic() - started)) > 1000)
        throw new Error('Application clock changed or clock verification expired before enrollment.');
    };
    assertFresh();
    return { ...result, assertFresh };
  };
  const sample = async () => {
    const start = monotonic();
    const observed = parseSample(await execute(CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS));
    const received = now();
    const duration = monotonic() - start;
    if (
      !validEpoch(Math.floor(received / 1000)) ||
      duration < 0 ||
      duration > 4000 ||
      Math.abs(received - hostStarted - (monotonic() - started)) > 1000
    )
      throw new Error('Application clock changed or controller clock observation expired.');
    // The remote sample occurred somewhere in the request interval. Do not
    // mistake a delayed response from an ahead clock for an aligned clock.
    const host = received - duration / 2;
    const uncertaintySeconds = Math.ceil(duration / 2000) + 1;
    const skew = observed.epoch - Math.floor(host / 1000);
    if (Math.abs(skew) > MAX_SKEW_SECONDS)
      throw new Error('Controller clock skew exceeds the supported ten-year bound.');
    return {
      observed,
      host,
      skew,
      uncertaintySeconds,
      withinTolerance: Math.abs(skew) + uncertaintySeconds <= CLOCK_TOLERANCE_SECONDS,
    };
  };
  try {
    const before = await sample();
    value = {
      hostUtc: new Date(before.host).toISOString(),
      controllerUtc: new Date(before.observed.epoch * 1000).toISOString(),
      skewSeconds: before.skew,
      uncertaintySeconds: before.uncertaintySeconds,
      observation: 'before-action',
      tool: before.observed.supported ? 'supported' : 'unsupported',
      action: 'none',
      result: before.withinTolerance ? 'within-tolerance' : 'correction-required',
    };
    await report(value);
    if (!confirmInstall || value.result === 'within-tolerance') return finish();
    if (!before.observed.supported) throw new Error('Unsupported FW31 clock tool; clock was not changed.');
    const epoch = Math.floor(before.host / 1000);
    if (
      !validEpoch(epoch) ||
      !validEpoch(epoch + 30) ||
      monotonic() - started > CLOCK_LIMITS.timeoutMs ||
      Math.abs(now() - hostStarted - (monotonic() - started)) > 1000
    )
      throw new Error('Clock correction authorization sample expired.');
    // Precompute a bounded UTC allowlist, including date rollover, rather than
    // assuming an undocumented FW31 date-parser option. Remote uptime selects
    // the current application-derived time even if SSH authentication is slow.
    const times = Array.from({ length: 31 }, (_, elapsed) => {
      const utc = new Date((epoch + elapsed) * 1000).toISOString();
      return `${elapsed}) time=${utc.slice(11, 19)}; date=${utc.slice(8, 10)}.${utc.slice(5, 7)}.${utc.slice(0, 4)};;`;
    }).join('\n');
    value = { ...value, action: 'synchronize', result: 'correcting' };
    await report(value);
    // The boot, uptime and pre-change epoch bind the command to its observation,
    // not the incorrect wall clock. An exclusive, empty /run marker consumes the
    // attempt even if the vendor fails; it expires at reboot, whose ID is pinned.
    // No NTP, timezone, TLS or freshness policy is changed.
    const script = `set -eu
export LC_ALL=C
test "$(cat /proc/sys/kernel/random/boot_id)" = '${before.observed.boot}'
${TOOL_CHECK} || exit 1
read uptime unused < /proc/uptime
uptime=\${uptime%%.*}
case "$uptime" in ''|*[!0-9]*) exit 1;; esac
elapsed=$((uptime - ${before.observed.uptime}))
test "$elapsed" -ge 0
test "$elapsed" -le 30
current=$(/bin/date -u +%s)
case "$current" in ''|*[!0-9]*) exit 1;; esac
delta=$((current - ${before.observed.epoch} - elapsed))
test "$delta" -ge -2
test "$delta" -le 2
case "$elapsed" in
${times}
*) exit 1;;
esac
umask 077
mkdir /run/attraccess-wago-clock-${randomBytes(16).toString('hex')}
timeout -s KILL 10 /etc/config-tools/config_clock type=utc "time=$time" "date=$date"
`;
    // Recheck after persistence, which can itself block or outlive ownership.
    if (
      monotonic() - started > CLOCK_LIMITS.timeoutMs ||
      Math.abs(now() - hostStarted - (monotonic() - started)) > 1000
    )
      throw new Error('Clock correction authorization sample expired.');
    await execute(script, CLOCK_LIMITS);
    const after = await sample();
    value = {
      ...value,
      hostUtc: new Date(after.host).toISOString(),
      controllerUtc: new Date(after.observed.epoch * 1000).toISOString(),
      previousSkewSeconds: before.skew,
      skewSeconds: after.skew,
      uncertaintySeconds: after.uncertaintySeconds,
      observation: 'after-action',
      result: 'synchronized',
    };
    if (
      after.observed.boot !== before.observed.boot ||
      after.observed.uptime < before.observed.uptime ||
      !after.withinTolerance
    )
      throw new Error('Controller clock correction postcondition failed; enrollment is blocked.');
    await report(value);
    return finish();
  } catch (error) {
    if (value) await report({ ...value, result: 'failed' });
    throw error;
  }
}
