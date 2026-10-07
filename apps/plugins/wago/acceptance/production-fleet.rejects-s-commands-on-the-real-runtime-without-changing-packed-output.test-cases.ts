import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope } from './production-fleet.spec';
export function registerRejectsSCommandsOnTheRealRuntimeWithoutChangingPackedOutput(
  scope: ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope,
): void {
  it.each(['expired', 'wrong-revision'])(
    'rejects %s commands on the real runtime without changing packed output',
    async (reason) => {
      const command = {
        id: randomUUID(),
        channelId: 'meter-load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: reason === 'wrong-revision' ? 2 : 1,
        expiresAt: new Date(Date.now() + (reason === 'expired' ? -1000 : 60_000)).toISOString(),
      };
      const before = await readFile(scope.dout, 'utf8');
      await scope.observer.publishAsync(`${scope.base}/commands`, JSON.stringify(command), { qos: 1 });
      await scope.eventually(() =>
        expect(
          scope
            .wire('acknowledgements')
            .some((message) => message.body.id === command.id && message.body.status === 'rejected'),
        ).toBe(true),
      );
      expect(await readFile(scope.dout, 'utf8')).toBe(before);
      expect(scope.errors).toEqual([]);
    },
  );
}
