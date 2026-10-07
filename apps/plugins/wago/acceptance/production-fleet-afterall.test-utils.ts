import 'reflect-metadata';

import { FleetFixtureState } from './production-fleet-fixture.test-utils';
export async function FleetAfterAll(state: FleetFixtureState): Promise<void> {
  state.nodes.splice(0);
  state.holdAcknowledgement = false;
  await state.heldAcknowledgement?.release();
  state.flow?.onModuleDestroy();
  state.backend?.onModuleDestroy();
  state.flowBinding?.onModuleDestroy();
  state.flowBinding = undefined;
  await Promise.all(
    [state.deviceClient, state.backendClient, state.observer].filter(Boolean).map((client) => client.endAsync(true)),
  );
  for (const socket of state.sockets) socket.destroy();
  if (state.server) await new Promise<void>((resolve) => state.server.close(() => resolve()));
  if (state.database?.isInitialized) await state.database.destroy();
  jest.restoreAllMocks();
}
