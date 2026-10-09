import { readFile, writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { CC100_DIGITAL_PROFILE } from './onboard-profile';
import { RUN_LED_PATHS } from './status-led';
import { hash } from '../runtime';
import { OnboardIoFixture, point, snapshot } from './onboard-io.test-utils';
jest.mock('node:fs/promises', () => ({ __esModule: true, ...jest.requireActual('node:fs/promises') }));
describe('CC100 packed digital I/O', () => {
  let fixture: OnboardIoFixture;
  beforeEach(async () => {
    fixture = new OnboardIoFixture();
    await fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('extracts every input independently for all packed byte values', async () => {
    for (let value = 0; value <= 255; value++) {
      await writeFile(fixture.paths.input, `${value}\n`);
      expect(await Promise.all(Array.from({ length: 8 }, (_, bit) => fixture.adapter.read(point(bit + 4))))).toEqual(
        Array.from({ length: 8 }, (_, bit) => Boolean(value & (1 << bit))),
      );
    }
  });

  it('keeps installer manifest and executable profile in sync', async () => {
    const manifest = JSON.parse(await readFile(join(__dirname, '../../manifest.json'), 'utf8'));
    expect(manifest.deployment.hardwareProfile).toBe('cc100-751-9301-fw31-digital-rtu-v1');
    expect(manifest.deployment.devices).toEqual([{ source: '/dev/ttySTM1', target: '/dev/serial', permissions: 'rw' }]);
    expect(manifest.deployment.privileged).toBe(false);
    const mounts: { target: string; optional?: boolean }[] = manifest.deployment.mounts;
    expect(mounts.filter((mount) => mount.optional).map((mount) => mount.target)).toEqual(Object.values(RUN_LED_PATHS));
    expect(mounts.filter((mount) => !mount.optional)).toEqual(
      Object.values(CC100_DIGITAL_PROFILE.registers).map((register) => ({
        source: register.hostPath,
        target: register.path,
        readOnly: register.readOnly,
      })),
    );
  });

  it('serializes simultaneous channel writes and preserves unrelated register bits', async () => {
    await writeFile(fixture.paths.output, '240');
    await Promise.all([0, 1, 2, 3].map((channel) => fixture.adapter.write(point(channel), true)));
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('255');
    await Promise.all([0, 2].map((channel) => fixture.adapter.write(point(channel), false)));
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('250');
    expect(await Promise.all([0, 1, 2, 3].map((channel) => fixture.adapter.read(point(channel))))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it.each(['', 'true', '-1', '1.5', '256', '1oops', '0x10'])(
    'rejects malformed packed register %j without clobbering it',
    async (value) => {
      await writeFile(fixture.paths.output, value);
      await expect(fixture.adapter.write(point(0), true)).rejects.toThrow('invalid packed digital register');
      expect(await readFile(fixture.paths.output, 'utf8')).toBe(value);
      await writeFile(fixture.paths.output, '8');
      await fixture.adapter.write(point(0), true);
      expect(await readFile(fixture.paths.output, 'utf8')).toBe('9');
    },
  );

  it('rejects invalid channels, profiles and input writes', async () => {
    for (const channel of [-1, 12, 0.5])
      await expect(fixture.adapter.read(point(channel))).rejects.toThrow('supported CC100 channels');
    await expect(fixture.adapter.read({ ...point(0), hardwareProfile: '879-3000' })).rejects.toThrow(
      'supported CC100 channels',
    );
    await expect(fixture.adapter.write(point(4), true)).rejects.toThrow('DI1 is not an output');
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
  });

  it('validates direction, aliases and unsupported measurement before configuration acceptance', async () => {
    expect(fixture.adapter.validate(snapshot)).toEqual([]);
    const invalid = structuredClone(snapshot);
    invalid.logicalChannels[0].capabilities = ['input'];
    invalid.logicalChannels[4].capabilities = ['input', 'pulse'];
    invalid.logicalChannels[5].capabilities = ['measurement'];
    invalid.physicalPoints.push({ ...point(0), id: 'alias' });
    invalid.logicalChannels.push({ ...snapshot.logicalChannels[1], id: 'DO2-alias' });
    expect(fixture.adapter.validate(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['invalid_direction', 'unsupported_point', 'duplicate_output']),
    );
    // Remove the malformed pulse first so runtime acceptance reaches hardware direction validation.
    invalid.logicalChannels[4].capabilities = ['input'];
    await fixture.runtime.start();
    await fixture.apply(invalid);
    expect(
      fixture.messages.filter(({ topic }) => topic.endsWith('/configuration/reported')).at(-1)?.payload.errors,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid_direction' })]));
    expect((await fixture.store.load()).accepted).toBeUndefined();
  });

  it('reports malformed referenced guard capabilities instead of throwing', async () => {
    await fixture.runtime.start();
    const invalid = {
      ...snapshot,
      logicalChannels: snapshot.logicalChannels.map((channel, index) =>
        index === 0
          ? {
              ...channel,
              capabilities: ['output', 'guard', 'feedback'],
              guard: { channelId: 'DI1', when: 'on' },
              feedback: { channelId: 'DI1', expected: 'match', timeoutMs: 10 },
            }
          : index === 4
            ? { ...channel, capabilities: {} }
            : channel,
      ),
    };
    await fixture.runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(invalid), snapshot: invalid })),
    );
    expect(fixture.messages.at(-1)?.payload.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_guard' }),
        expect.objectContaining({ code: 'invalid_feedback' }),
      ]),
    );
  });
});
