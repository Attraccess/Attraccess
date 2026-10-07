import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { parseOperationalMessage } from '../backend/protocol';
import type { ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope } from './production-fleet.spec';
export function registerAcquiresFractionalModbusPowerReadsThenAsynchronouslyWaitsInTheRealGraphAndWritesDo2(
  scope: ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope,
): void {
  it('acquires fractional Modbus power, reads then asynchronously waits in the real graph, and writes DO2', async () => {
    scope.graph('meter', 'power', 'measurement', 13625, 'meter-load');
    await scope.runtime.publishMeasurements();
    await scope.eventually(() => expect(scope.completed('meter-1')).toHaveLength(1));
    const first = scope.required(scope.wire('measurements').at(-1));
    expect(first.body).toMatchObject({ channelId: 'power', value: 12375, unit: 'milliwatt', kind: 'live' });
    expect(parseOperationalMessage(scope.prefix, first.topic, first.payload)).toMatchObject({
      hardwareId: scope.hardwareId,
      message: { category: 'measurement', value: 12375, unit: 'milliwatt', kind: 'live' },
    });
    expect(scope.completed('meter-1')[0].payload?.().output.wago).toMatchObject({ value: 12375, available: true });
    expect(scope.completed('meter-2')).toHaveLength(0);
    const before = scope.wire('commands').length;
    expect(await readFile(scope.dout, 'utf8')).toBe('9');
    scope.modbusRaw = 13.625;
    await scope.delay(110); // Cross the actual adapter poll interval, not a mocked clock.
    await scope.runtime.publishMeasurements();
    await scope.eventually(() => expect(scope.completed('meter-3').length).toBeGreaterThan(0));
    expect(scope.modbusRequests).toHaveLength(2);
    expect(scope.required(scope.wire('measurements').at(-1)).body).toMatchObject({
      value: 13625,
      unit: 'milliwatt',
      streamId: first.body.streamId,
    });
    expect(scope.required(scope.wire('measurements').at(-1)).body.sequence).toBeGreaterThan(first.body.sequence);
    expect(scope.wire('commands').length).toBeGreaterThan(before);
    expect(await readFile(scope.dout, 'utf8')).toBe('11'); // DO1 + DO2, preserving DO4.
    const command = scope.required(scope.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    expect(
      scope
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    scope.nodes.splice(0);
    scope.edges.splice(0);
    await scope.eventually(() =>
      expect(scope.flow.payload(scope.required(scope.flow.read(scope.query('meter-load'))))).toMatchObject({
        value: true,
        available: true,
      }),
    );
    expect(scope.errors).toEqual([]);
  });
}
