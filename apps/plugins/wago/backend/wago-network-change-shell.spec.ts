import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { networkChangeDeviceProgram } from './wago-network-change-shell';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { registerRecreatesTheInstalledImageWithPersistentCredentialsPreservingStateHardwareMountsTlsAndR } from './wago-network-change-shell.recreates-the-installed-image-with-persistent-credentials-preserving-state-hardware-mounts-tls-and-r.test-cases';
import { registerRollsForwardAfterInterruptionBetweenContainerDeletionAndRecreation } from './wago-network-change-shell.rolls-forward-after-interruption-between-container-deletion-and-recreation.test-cases';
import { registerMakesThePublicBrokerCaReadableByTheNonRootRuntimeWhileKeepingCredentialsPrivate } from './wago-network-change-shell.makes-the-public-broker-ca-readable-by-the-non-root-runtime-while-keeping-credentials-private.test-cases';
import { registerRejectsAStateFileSymlinkWithoutModifyingItsTargetOrRecreatingAContainer } from './wago-network-change-shell.rejects-a-state-file-symlink-without-modifying-its-target-or-recreating-a-container.test-cases';
import { registerAcquiresTheInstallationLockVerifiesPayloadIntegrityBeforeStoppingAndStartsViaTheExistin } from './wago-network-change-shell.acquires-the-installation-lock-verifies-payload-integrity-before-stopping-and-starts-via-the-existin.test-cases';
import { registerReleasesOnlyTheSupersededJournalAndPreservesAnInterruptedReplacementOnEveryRetry } from './wago-network-change-shell.releases-only-the-superseded-journal-and-preserves-an-interrupted-replacement-on-every-retry.test-cases';
import { registerExecutesTheCompleteStreamedHelperTransactionAndSupervisorHandoffThenAcknowledgesIdempoten } from './wago-network-change-shell.executes-the-complete-streamed-helper-transaction-and-supervisor-handoff-then-acknowledges-idempoten.test-cases';

describe('fixed MQTT recreation program and durable state', () => {
  defineFixedMqttRecreationProgramAndDurableStateTests();
});

export function defineFixedMqttRecreationProgramAndDurableStateTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  let original: Record<string, unknown>, current: typeof original | null, created: typeof original | null;
  let requests: string[], interruptCreate: boolean;
  const image = `sha256:${'a'.repeat(64)}`;
  const payload = {
    schema: 1,
    operationToken: 'b'.repeat(32),
    hardwareId: 'cc100-1',
    token: 't'.repeat(43),
    credentialEpoch: '22222222-2222-4222-8222-222222222222',
    username: 'wago-controller-cc100-1',
    password: 'new-password',
    prefix: 'attraccess/wago',
    url: 'mqtts://new-broker.test:8883',
    tlsInsecure: false,
    tlsServername: 'broker.internal',
    caCert: 'new-ca',
  };
  const state = {
    credentials: {
      username: payload.username,
      password: 'old-password',
      prefix: payload.prefix,
      credentialEpoch: 'old-epoch',
    },
    credentialRotation: { revision: 5, token: 'old-token' },
    accepted: { revision: 37, contentHash: 'saved-hash', snapshot: { channels: ['saved-channel'] } },
    outputs: { lamp: true },
    commandIds: ['command-a'],
    sequence: 2000,
    pendingPulseRoutes: [{ point: 'retained-route' }],
    manualOutputChannelIds: ['lamp'],
    uncertainOutputChannelIds: ['pump'],
    futureField: { preserved: true },
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    requests = [];
    created = null;
    interruptCreate = false;
    original = {
      Id: 'c'.repeat(64),
      Image: image,
      State: { Running: false },
      Config: {
        Image: 'original-image-tag',
        User: '10001:10001',
        Cmd: ['node', 'main.cjs'],
        Entrypoint: null,
        Env: [
          'WAGO_HARDWARE_ID=cc100-1',
          'WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-modbus-v1',
          'WAGO_ENROLLMENT_SECRET=preserved-secret',
          'WAGO_PAIRING_CODE=123456',
          'WAGO_MQTT_PASSWORD=old-environment-password',
          'WAGO_MQTT_URL=mqtt://old-broker.test:1883',
          'EXTRA=keep-me',
        ],
        Labels: { installed: 'original' },
        WorkingDir: '/app',
        Volumes: { '/var/lib/attraccess-wago': {} },
      },
      HostConfig: {
        RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
        NetworkMode: 'host',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Devices: [{ PathOnHost: '/dev/ttyRS485', PathInContainer: '/dev/ttyRS485', CgroupPermissions: 'rwm' }],
        Binds: ['/var/lib/attraccess-wago:/var/lib/attraccess-wago', '/custom/cert:/custom/cert:ro'],
        Mounts: [{ Type: 'bind', Source: '/sys/dout', Target: '/run/attraccess-wago/io/dout' }],
        LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } },
      },
      Mounts: [{ Type: 'bind', Source: '/var/lib/attraccess-wago', Destination: '/var/lib/attraccess-wago', RW: true }],
      NetworkSettings: { Networks: {} },
    };
    current = structuredClone(original);
    fixture.file('var/lib/attraccess-wago-network-transaction/container.json', JSON.stringify([original]));
    fixture.file('var/lib/attraccess-wago-network-transaction/payload', JSON.stringify(payload));
    fixture.file('var/lib/attraccess-wago-network-transaction/ca-source', '/etc/attraccess-wago/runtime-ca.pem\n');
    fixture.file('var/lib/attraccess-wago/state.json', JSON.stringify(state));
    fixture.file(
      'etc/attraccess-wago/runtime.env',
      'WAGO_HARDWARE_ID=cc100-1\nWAGO_PAIRING_CODE=123456\nWAGO_ENROLLMENT_SECRET=preserved-secret\nWAGO_MQTT_URL=mqtt://old-broker.test:1883\nWAGO_MQTT_PASSWORD=old-environment-password\nEXTRA=keep-me\n',
    );
  });
  afterEach(() => fixture.dispose());
  async function run() {
    const mockHttp = {
      request: (
        { method, path }: { method: string; path: string },
        callback: (response: EventEmitter & { statusCode?: number }) => void,
      ) => {
        const req = new EventEmitter() as EventEmitter & {
          setTimeout: () => void;
          end: (body: string) => void;
          destroy: () => void;
        };
        req.setTimeout = () => undefined;
        req.destroy = () => undefined;
        req.end = (body) => {
          requests.push(`${method} ${path}`);
          if (method === 'POST' && interruptCreate) {
            setImmediate(() => req.emit('error', new Error('interrupted-create')));
            return;
          }
          const response = Object.assign(new EventEmitter(), { statusCode: 0 });
          let output: unknown;
          if (method === 'GET') {
            response.statusCode = current ? 200 : 404;
            output = current ?? {};
          }
          if (method === 'DELETE') {
            response.statusCode = 204;
            current = null;
          }
          if (method === 'POST') {
            response.statusCode = 201;
            created = JSON.parse(body);
            current = { Id: 'd'.repeat(64), Image: image, Config: created, State: { Running: false } };
            output = { Id: current.Id };
          }
          setImmediate(() => {
            callback(response);
            if (output) response.emit('data', Buffer.from(JSON.stringify(output)));
            response.emit('end');
          });
        };
        return req;
      },
    };
    const code = networkChangeDeviceProgram
      .replace(
        "const tx = '/transaction', config = '/configuration', data = '/data';",
        `const tx = ${JSON.stringify(join(fixture.root, 'var/lib/attraccess-wago-network-transaction'))}, config = ${JSON.stringify(join(fixture.root, 'etc/attraccess-wago'))}, data = ${JSON.stringify(join(fixture.root, 'var/lib/attraccess-wago'))};`,
      )
      .replace(
        "apply().catch(() => { process.stderr.write('MQTT recreation requires recovery\\n'); process.exitCode = 1; });",
        'globalThis.result = apply();',
      );
    const sandbox = {
      require: (name: string) =>
        name === 'node:fs' ? { ...fs, fchownSync: () => undefined } : name === 'node:http' ? mockHttp : require(name),
      Buffer,
      result: undefined as unknown as Promise<void>,
    };
    runInNewContext(code, sandbox);
    await sandbox.result;
  }
  const scope = {
    get run() {
      return run;
    },
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get state() {
      return state;
    },
    get payload() {
      return payload;
    },
    get created() {
      return created;
    },
    set created(value: typeof created) {
      created = value;
    },
    get image() {
      return image;
    },
    get original() {
      return original;
    },
    set original(value: typeof original) {
      original = value;
    },
    get requests() {
      return requests;
    },
    set requests(value: typeof requests) {
      requests = value;
    },
    get interruptCreate() {
      return interruptCreate;
    },
    set interruptCreate(value: typeof interruptCreate) {
      interruptCreate = value;
    },
    get current() {
      return current;
    },
    set current(value: typeof current) {
      current = value;
    },
  };

  registerRecreatesTheInstalledImageWithPersistentCredentialsPreservingStateHardwareMountsTlsAndR(scope);

  registerRollsForwardAfterInterruptionBetweenContainerDeletionAndRecreation(scope);

  registerMakesThePublicBrokerCaReadableByTheNonRootRuntimeWhileKeepingCredentialsPrivate(scope);

  registerRejectsAStateFileSymlinkWithoutModifyingItsTargetOrRecreatingAContainer(scope);

  registerAcquiresTheInstallationLockVerifiesPayloadIntegrityBeforeStoppingAndStartsViaTheExistin(scope);

  registerReleasesOnlyTheSupersededJournalAndPreservesAnInterruptedReplacementOnEveryRetry(scope);

  registerExecutesTheCompleteStreamedHelperTransactionAndSupervisorHandoffThenAcknowledgesIdempoten(scope);

  return scope;
}

export type FixedMqttRecreationProgramAndDurableStateTestScope = ReturnType<
  typeof defineFixedMqttRecreationProgramAndDurableStateTests
>;
