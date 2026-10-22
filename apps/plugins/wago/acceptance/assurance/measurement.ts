import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rename, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AssuranceFixture, delay, eventually } from './fixture';

import { runLoadStage, measuredRecommendation, type Stage } from './load-stage';
type Options = {
  durationSeconds: number;
  rate: number;
  controllers: number;
  seed: number;
  memoryMiB: number;
  maxPending: number;
  faults: string[];
};
const exec = promisify(execFile);

export async function measure(options: Options, output: string, fixture = new AssuranceFixture()) {
  if (!output || !options.durationSeconds) throw new Error('Use the assurance runner');
  const loop = monitorEventLoopDelay({ resolution: 20 });
  const stages: Stage[] = [];
  const faults: Array<{ name: string; recoveryMs: number; reconnectMs: number | null; passed: boolean }> = [];
  const samples: Array<{ seconds: number; rss: number; heap: number; pending: number; eventLoopP99Ms: number }> = [];
  const started = Date.now();
  let random = options.seed;
  const next = () => {
    random = (random * 48271) % 2147483647;
    return random;
  };
  let pending = 0;
  let peakRss = 0;
  let peakEventLoopP99Ms = 0;
  let outcome = 'running';
  let sampleTimer: ReturnType<typeof setInterval> | undefined;
  let highest = 0;
  function reportContents() {
    return JSON.stringify(
      {
        contract: 'wago-software-measurements-v1',
        outcome,
        elapsedSeconds: (Date.now() - started) / 1000,
        boundaries: {
          offered: 'generated command at stage ingress',
          expectedOffers: 'configured rate multiplied by scheduled stage duration',
          generationFailures: 'scheduled offers not generated; at most 1% tolerated',
          achievedCommandsPerSecond: 'acknowledged commands divided by actual stage time including drain',
          acknowledged: 'production plugin matched controller acknowledgement after runtime processing',
          received: 'operational packet seen at backend MQTT connection',
          gaps: 'sequence gaps between observed packets in the same controller, stream and category; excludes the first packet',
          runtimeWrites: 'successful memory-adapter writes, including startup and policies; not physical observations',
          processed: 'production diagnostics accepted packet',
          transportOversizedRejected:
            'matching oversized runtime MQTT packets dropped before listener delivery; once per wire event, retained across transport replacement',
          transportAcknowledgementTimeouts:
            'runtime MQTT PUBACK/SUBACK deadline expirations; one deadline can reject several pending operations; retained across transport replacement, separate from stage command acknowledgement timeouts',
          wireAdmissionRejected:
            'runtime and backend admission rejections, retained across replacement; separate from parser and diagnostics observations',
          runtimeRejected:
            'runtime parsing, structure and validation/policy rejections before actuation; per handler invocation, payload-free, retained across runtime replacement; separate from transport/admission and backend observations',
          protocolRejected: 'ingress packets rejected by the operational parser',
          diagnosticsRejected: 'diagnostics callback rejections; may include duplicate subscriptions',
          rejected: 'sum of protocol and diagnostics rejections; processing observations, not unique wire packets',
          missing: 'stage offered minus acknowledgements, failures and overload discards',
          intentionalDiscard:
            'outgoing QoS publications explicitly removed by the production transport on disconnect or acknowledgement timeout',
        },
        stages: stages.map((stage) => ({
          ...stage,
          latencyMs: undefined,
          latencySamples: stage.latencyMs.length,
          p99Ms: stage.latencyMs.length
            ? [...stage.latencyMs].sort((a, b) => a - b)[Math.floor((stage.latencyMs.length - 1) * 0.99)]
            : null,
          missing: stage.offered - stage.acknowledged - stage.failed - stage.overloadDiscard,
        })),
        recoveryBoundary:
          'fault invocation to fresh heartbeat, connected state, matching configuration, available software adapter and acknowledged command',
        reconnectBoundary:
          'runtime CONNECT duration; broker start_app invocation to all MQTT clients connected; null for plugin restart using existing connection',
        faults,
        counters: {
          ...fixture.counts,
          transportAcknowledgementTimeouts: fixture.transportAcknowledgementTimeouts,
          intentionalDiscard:
            fixture.retiredStaleDiscarded +
            fixture.devices.reduce((sum, device) => sum + (device.transport?.statistics.staleDiscarded ?? 0), 0),
          transportOversizedRejected:
            fixture.retiredTransportRejected +
            fixture.devices.reduce((sum, device) => sum + (device.transport?.statistics.oversizedRejected ?? 0), 0),
          runtimeRejected: Object.fromEntries(
            (['parsing', 'structure', 'validation'] as const).map((reason) => [
              reason,
              fixture.retiredRuntimeRejected[reason] +
                fixture.devices.reduce(
                  (sum, device) => sum + (device.runtime?.messageStatistics.runtimeRejected[reason] ?? 0),
                  0,
                ),
            ]),
          ),
          wireAdmissionRejected:
            fixture.retiredWireRejected +
            fixture.devices.reduce((sum, device) => sum + (device.runtime?.messageStatistics.rejected ?? 0), 0) +
            (fixture.backend?.messageStatistics.rejected ?? 0),
        },
        peakRss,
        peakEventLoopP99Ms,
        latencySamplePolicy: 'last 4096 acknowledged commands per stage',
        samples,
        recommendation:
          outcome === 'passed'
            ? {
                controllers: options.controllers,
                requestedCommandsPerSecond: highest,
                commandsPerSecond: measuredRecommendation(stages, highest),
                evidenceClass: 'software-fixtures-only',
                physicalCapacity: 'unverified',
              }
            : null,
      },
      null,
      2,
    );
  }
  async function writeReport() {
    // Checkpoints share the event loop with command delivery and acknowledgement.
    // Never block it on evidence storage, especially a shared host filesystem.
    const temporary = join(output, 'measurements.json.next');
    await writeFile(temporary, reportContents());
    await rename(temporary, join(output, 'measurements.json'));
  }
  const interrupt = () => {
    outcome = 'interrupted';
    try {
      // Exit immediately after the synchronous final snapshot. An in-progress
      // checkpoint cannot replace it because its rename needs the event loop.
      writeFileSync(join(output, 'measurements.json'), reportContents());
    } finally {
      process.exit(143);
    }
  };
  process.on('SIGTERM', interrupt);
  process.on('SIGINT', interrupt);
  try {
    await fixture.start(options.controllers);
    loop.enable();
    const sample = () => {
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      const value = {
        seconds: (Date.now() - started) / 1000,
        rss: memory.rss,
        heap: memory.heapUsed,
        pending,
        runtimePending: fixture.devices.reduce((sum, device) => sum + device.runtime.messageStatistics.pending, 0),
        backendPending: fixture.backend.messageStatistics.pending,
        transportPending: fixture.devices.reduce((sum, device) => sum + device.transport.statistics.pending, 0),
        eventLoopP99Ms: loop.percentile(99) / 1e6,
      };
      peakEventLoopP99Ms = Math.max(peakEventLoopP99Ms, value.eventLoopP99Ms);
      // A fixed ring, even for 24 hour runs; no raw payloads or credentials.
      if (samples.length === 2048) samples.shift();
      samples.push(value);
      loop.reset();
    };
    sampleTimer = setInterval(sample, 1000);
    for (const name of options.faults) {
      const start = Date.now();
      const fault = { name, recoveryMs: 0, reconnectMs: null as number | null, passed: false };
      faults.push(fault);
      if (name === 'runtime') {
        const device = fixture.devices[0];
        await device.client.endAsync(true);
        await fixture.startDevice(device);
        fault.reconnectMs = device.connectMs;
      } else if (name === 'plugin') {
        fixture.backend.onModuleDestroy();
        await fixture.startBackend();
      } else {
        const context = process.env.WAGO_FLEET_DOCKER_CONTEXT;
        const container = process.env.WAGO_FLEET_CONTAINER;
        if (!context || !container) throw new Error('Missing owned broker identity');
        const docker = (...args: string[]) => exec('docker', ['--context', context, ...args], { timeout: 90_000 });
        const info = JSON.parse((await docker('inspect', container)).stdout)[0];
        if (info.Id !== container || info.Config.Labels['attraccess.fixture'] !== 'production-fleet')
          throw new Error('Broker ownership mismatch');
        await Promise.all(fixture.devices.map((device) => device.runtime.setConnected(false)));
        await docker('exec', container, 'rabbitmqctl', 'stop_app');
        await delay(500);
        const reconnectingAt = Date.now();
        await docker('exec', container, 'rabbitmqctl', 'start_app');
        await eventually(
          () => fixture.backendClient.connected && fixture.devices.every((device) => device.client.connected),
          60_000,
        );
        fault.reconnectMs = Date.now() - reconnectingAt;
        await Promise.all(fixture.devices.map((device) => device.runtime.setConnected(true)));
      }
      await fixture.fresh();
      await fixture.command(fixture.devices[0]);
      fault.recoveryMs = Date.now() - start;
      fault.passed = true;
    }
    const perStage = Math.max(1, Math.floor(options.durationSeconds / 4));
    const rates = [
      ...new Set([Math.max(1, Math.floor(options.rate / 4)), Math.max(1, Math.floor(options.rate / 2)), options.rate]),
    ];

    async function runStage(rate: number, repeat: boolean, seconds: number) {
      const stage = await runLoadStage({
        rate,
        repeat,
        seconds,
        maxPending: options.maxPending,
        memoryReached: () => peakRss > options.memoryMiB * 1024 * 1024,
        command: () => fixture.command(fixture.devices[next() % fixture.devices.length]),
        pendingChanged: (value) => {
          pending = value;
        },
        started: (value) => {
          stages.push(value);
        },
        progress: writeReport,
      });
      await writeReport();
      return stage.passed;
    }
    for (const rate of rates) {
      if (!(await runStage(rate, false, perStage))) break;
      highest = rate;
    }
    if (!highest) throw new Error('No passing load stage');
    if (!(await runStage(highest, true, Math.max(perStage, options.durationSeconds - perStage * stages.length))))
      throw new Error('Repeated load stage did not pass');
    if (fixture.errors.length) throw new Error('Fixture processing errors');
    outcome = 'passed';
    await writeReport();
    await writeFile(
      join(output, 'summary.txt'),
      `Software fixtures only. ${options.controllers} independent controllers; requested ${highest} commands/s; measured recommendation ${measuredRecommendation(stages, highest)} commands/s across both passing stages. Duration ${options.durationSeconds}s; peak process RSS ${Math.ceil(peakRss / 1048576)} MiB. Physical capacity and independent reviews remain unverified.\n`,
    );
  } finally {
    if (sampleTimer) clearInterval(sampleTimer);
    loop.disable();
    process.off('SIGTERM', interrupt);
    process.off('SIGINT', interrupt);
    // Persist a failed partial result even when setup, a fault or a budget check aborts.
    if (outcome !== 'passed') {
      outcome = 'failed';
      await writeReport();
      await writeFile(
        join(output, 'failure.json'),
        JSON.stringify({ outcome, elapsedSeconds: (Date.now() - started) / 1000, stages, faults, peakRss }, null, 2),
      );
    }
    await fixture.close();
  }
}
