// Test-only: a second matter.js controller with its own fabric, storage and port. It stands for "another ecosystem":
// it joins devices through a sharing code and shows up as another administrator. Like the rest of `src/testing`, it is
// excluded from the shipped build and reachable through no HTTP route.
import { Seconds } from '@matter/main';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatterController } from '../fabric/controller';
import { layoutFor } from '../fabric/storage';
import { freeUdpPort } from './ports';

export type SecondController = {
  controller: MatterController;
  fabricId: string;
  /** Joins the device that has an open commissioning window, with the manual code or the QR payload. */
  commissionWithCode(code: string): Promise<string>;
  stop(): Promise<void>;
};

/** Starts the controller and creates its fabric. Call `useLoopbackMdns()` first, as for every test controller. */
export async function startSecondController(label = 'Other ecosystem'): Promise<SecondController> {
  const root = mkdtempSync(join(tmpdir(), 'matter-second-'));
  const controller = new MatterController({ layout: layoutFor(root), port: await freeUdpPort() });
  await controller.start();
  const facts = await controller.createFabric(label);
  return {
    controller,
    fabricId: facts.fabricId,
    async commissionWithCode(code) {
      const peer = await controller.serverNode.peers.commission({ pairingCode: code, timeout: Seconds(60) });
      return String(peer.state.commissioning.peerAddress?.nodeId);
    },
    async stop() {
      await controller.stop();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
