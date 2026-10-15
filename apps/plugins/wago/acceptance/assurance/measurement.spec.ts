import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AssuranceFixture, delay, eventually } from './fixture';

type Stage = {
  rate: number;
  repeat: boolean;
  seconds: number;
  offered: number;
  acknowledged: number;
  failed: number;
  timeout: number;
  overloadDiscard: number;
  maxPending: number;
  latencyMs: number[];
  passed: boolean;
};
const options = JSON.parse(process.env.WAGO_ASSURANCE_OPTIONS ?? '{}') as {
  durationSeconds: number;
  rate: number;
  controllers: number;
  seed: number;
  memoryMiB: number;
  maxPending: number;
  faults: string[];
};
const output = process.env.WAGO_ASSURANCE_OUTPUT ?? '';
const exec = promisify(execFile);

describe('measured software envelope with real broker and production processing', () => {
  it('repeats the highest passing stage and records failures rather than claiming hardware capacity', async () => {
    if (!output || !options.durationSeconds) throw new Error('Use the assurance runner');
    const fixture = new AssuranceFixture();
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
        ...new Set([
          Math.max(1, Math.floor(options.rate / 4)),
          Math.max(1, Math.floor(options.rate / 2)),
          options.rate,
        ]),
      ];
      let highest = 0;
      async function runStage(rate: number, repeat: boolean, seconds: number) {
        const stage: Stage = {
          rate,
          repeat,
          seconds: 0,
          offered: 0,
          acknowledged: 0,
          failed: 0,
          timeout: 0,
          overloadDiscard: 0,
          maxPending: 0,
          latencyMs: [],
          passed: false,
        };
        stages.push(stage);
        const start = Date.now();
        const inFlight = new Set<Promise<void>>();
        let nextOffer = start;
        while (Date.now() - start < seconds * 1000) {
          if (peakRss > options.memoryMiB * 1024 * 1024) throw new Error('Declared memory budget reached');
          stage.offered++;
          if (pending >= options.maxPending) stage.overloadDiscard++;
          else {
            pending++;
            stage.maxPending = Math.max(stage.maxPending, pending);
            const sentAt = Date.now();
            const operation = fixture
              .command(fixture.devices[next() % fixture.devices.length])
              .then(() => {
                stage.acknowledged++;
                if (stage.latencyMs.length === 4096) stage.latencyMs.shift();
                stage.latencyMs.push(Date.now() - sentAt);
              })
              .catch((error: unknown) => {
                stage.failed++;
                if (
                  String(error).toLowerCase().includes('timeout') ||
                  String(error).toLowerCase().includes('timed out')
                )
                  stage.timeout++;
              })
              .finally(() => {
                pending--;
                inFlight.delete(operation);
              });
            inFlight.add(operation);
          }
          if (stage.offered % Math.max(1, rate * 5) === 0) await writeReport();
          nextOffer += 1000 / rate;
          await delay(Math.max(1, nextOffer - Date.now()));
        }
        await Promise.all(inFlight);
        stage.seconds = (Date.now() - start) / 1000;
        stage.passed = stage.failed === 0 && stage.overloadDiscard === 0 && stage.offered === stage.acknowledged;
        await writeReport();
        return stage.passed;
      }
      async function writeReport() {
        await writeFile(
          join(output, 'measurements.json'),
          JSON.stringify(
            {
              contract: 'wago-software-measurements-v1',
              outcome,
              elapsedSeconds: (Date.now() - started) / 1000,
              boundaries: {
                offered: 'scheduled command at stage ingress',
                acknowledged: 'production plugin matched controller acknowledgement after runtime processing',
                received: 'operational packet seen at backend MQTT connection',
                gaps: 'sequence gaps between observed packets in the same controller, stream and category; excludes the first packet',
                runtimeWrites:
                  'successful memory-adapter writes, including startup and policies; not physical observations',
                processed: 'production diagnostics accepted packet',
                rejected: 'diagnostics or protocol rejected packet; includes duplicate subscriptions',
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
                intentionalDiscard:
                  fixture.retiredStaleDiscarded +
                  fixture.devices.reduce((sum, device) => sum + device.transport.statistics.staleDiscarded, 0),
                wireAdmissionRejected:
                  fixture.retiredWireRejected +
                  fixture.devices.reduce((sum, device) => sum + device.runtime.messageStatistics.rejected, 0) +
                  fixture.backend.messageStatistics.rejected,
              },
              peakRss,
              peakEventLoopP99Ms,
              latencySamplePolicy: 'last 4096 acknowledged commands per stage',
              samples,
              recommendation:
                outcome === 'passed'
                  ? {
                      controllers: options.controllers,
                      commandsPerSecond: highest,
                      evidenceClass: 'software-fixtures-only',
                      physicalCapacity: 'unverified',
                    }
                  : null,
            },
            null,
            2,
          ),
        );
      }
      for (const rate of rates) {
        if (!(await runStage(rate, false, perStage))) break;
        highest = rate;
      }
      if (!highest) throw new Error('No passing load stage');
      expect(
        await runStage(highest, true, Math.max(perStage, options.durationSeconds - perStage * stages.length)),
      ).toBe(true);
      expect(fixture.errors).toEqual([]);
      outcome = 'passed';
      await writeReport();
      await writeFile(
        join(output, 'summary.txt'),
        `Software fixtures only. ${options.controllers} independent controllers; repeated ${highest} commands/s. Duration ${options.durationSeconds}s; peak process RSS ${Math.ceil(peakRss / 1048576)} MiB. Physical capacity and independent reviews remain unverified.\n`,
      );
    } finally {
      if (sampleTimer) clearInterval(sampleTimer);
      loop.disable();
      // Persist a failed partial result even when setup, a fault or a budget check aborts.
      if (outcome !== 'passed') {
        outcome = 'failed';
        await writeFile(
          join(output, 'failure.json'),
          JSON.stringify({ outcome, elapsedSeconds: (Date.now() - started) / 1000, stages, faults, peakRss }, null, 2),
        );
      }
      await fixture.close();
    }
  });
});
