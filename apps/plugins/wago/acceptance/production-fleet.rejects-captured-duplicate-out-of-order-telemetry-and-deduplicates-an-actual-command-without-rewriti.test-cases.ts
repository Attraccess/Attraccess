import 'reflect-metadata';
import { readFile, writeFile } from 'node:fs/promises';
import type { ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope } from './production-fleet.spec';
export function registerRejectsCapturedDuplicateOutOfOrderTelemetryAndDeduplicatesAnActualCommandWithoutRewriti(
  scope: ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope,
): void {
  it('rejects captured duplicate/out-of-order telemetry and deduplicates an actual command without rewriting its output', async () => {
    await scope.delay(100); // Let already-running graph dispatches finish.
    scope.graph('replay', 'power', 'measurement', 13625, 'meter-load');
    const latest = scope.required(scope.flow.read(scope.query('power', 'measurement')));
    const measurements = scope.wire('measurements');
    const starts = scope.logs.filter((log) => log.type === 'flow.start').length;
    const commands = scope.wire('commands').length;
    const warningsBefore = scope.warnings.length;
    for (const message of [scope.required(measurements.at(-1)), measurements[0]])
      await scope.observer.publishAsync(message.topic, message.payload, { qos: 1 });
    await scope.eventually(() =>
      expect(
        scope.warnings.slice(warningsBefore).filter((message) => message.includes('duplicate or out-of-order')).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(scope.flow.read(scope.query('power', 'measurement'))).toBe(latest);
    expect(scope.logs.filter((log) => log.type === 'flow.start')).toHaveLength(starts);
    expect(scope.wire('commands')).toHaveLength(commands);
    scope.nodes.splice(0);
    scope.edges.splice(0);
    const command = scope.required(scope.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    // External fixture reset makes a repeated physical write observable.
    await writeFile(scope.dout, '9');
    await scope.observer.publishAsync(command.topic, command.payload, { qos: 1 });
    await scope.eventually(() =>
      expect(
        scope
          .wire('acknowledgements')
          .some((message) => message.body.id === command.body.id && message.body.status === 'duplicate'),
      ).toBe(true),
    );
    expect(await readFile(scope.dout, 'utf8')).toBe('9');
    expect(JSON.parse(await readFile(scope.statePath, 'utf8')).commandIds).toContain(command.body.id);
    expect(scope.errors).toEqual([]);
  });
}
