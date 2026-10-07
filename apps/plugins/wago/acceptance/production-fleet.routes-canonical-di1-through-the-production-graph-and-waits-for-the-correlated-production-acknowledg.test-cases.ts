import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseOperationalMessage } from '../backend/protocol';
import { hash } from '../cc100-runtime/src/runtime';
import type { ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope } from './production-fleet.spec';
export function registerRoutesCanonicalDi1ThroughTheProductionGraphAndWaitsForTheCorrelatedProductionAcknowledg(
  scope: ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope,
): void {
  it('routes canonical DI1 through the production graph and waits for the correlated production acknowledgement', async () => {
    scope.graph('input', 'input', 'state', true, 'input-load');
    scope.holdAcknowledgement = true;
    await writeFile(scope.din, '1');
    await scope.runtime.pollInputs();
    await scope.eventually(() => expect(scope.heldAcknowledgement).toBeDefined());
    const command = scope.required(scope.wire('commands').at(-1));
    expect(command.body).toMatchObject({ channelId: 'input-load', value: true, expectedConfigurationRevision: 1 });
    expect(Date.parse(command.body.expiresAt)).toBeGreaterThan(Date.now());
    expect((scope.required(scope.heldAcknowledgement).payload as Record<string, unknown>).id).toBe(command.body.id);
    expect(await readFile(scope.dout, 'utf8')).toBe('9');
    expect(scope.completed('input-1').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(scope.completed('input-2').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(scope.completed('input-3')).toHaveLength(0);
    // A wrong ID traverses RabbitMQ/backend but must not finish the command node.
    const wrongId = randomUUID();
    await scope.observer.publishAsync(
      `${scope.base}/acknowledgements`,
      JSON.stringify({ ...(scope.required(scope.heldAcknowledgement).payload as object), id: wrongId }),
      { qos: 1 },
    );
    await scope.eventually(() => expect(scope.processedAcknowledgements.has(wrongId)).toBe(true));
    // Drain promise continuations from the processed acknowledgement, including
    // command-node completion, without a timing-based negative assertion window.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(scope.completed('input-3')).toHaveLength(0);
    scope.holdAcknowledgement = false;
    await scope.required(scope.heldAcknowledgement).release();
    scope.heldAcknowledgement = undefined;
    await scope.eventually(() => expect(scope.completed('input-3').length).toBeGreaterThan(0));
    const state = scope.required(scope.wire('state').find((message) => message.body.inputs?.input === true));
    expect(parseOperationalMessage(scope.prefix, state.topic, state.payload)).toMatchObject({
      hardwareId: scope.hardwareId,
      message: { category: 'state', inputs: { input: true }, revision: 1, contentHash: hash(scope.snapshot) },
    });
    expect(
      scope
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    // Stop matching subsequent full snapshots before building the meter graph.
    scope.nodes.splice(0);
    scope.edges.splice(0);
    expect(scope.errors).toEqual([]);
  });
}
