// Test-only: a virtual matter.js OnOff light, and the helpers that commission it and toggle it by driving the sidecar's
// controller from test code. This module is excluded from the shipped build (tsconfig.app.json) and is reachable
// through no HTTP route and no environment flag. Public commissioning and commands belong to later tickets.
import { Endpoint, Logger, LogLevel, Seconds, ServerNode, VendorId } from '@matter/main';
import { OnOffClient } from '@matter/main/behaviors';
import { OnOffLightDevice } from '@matter/main/devices';
import { NodeJsEnvironment } from '@matter/nodejs';
import { randomInt } from 'node:crypto';
import type { MatterController } from '../fabric/controller';

/** Setup passcodes the Matter specification forbids, besides 0 and 99999999, which are out of range. */
const INVALID_PASSCODES = new Set([
  11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 12345678, 87654321,
]);

/**
 * Random commissioning credentials. Test processes in parallel worktrees share the loopback mDNS, so a fixed
 * discriminator and passcode would let one test commission another test's device.
 */
export function randomCommissioningCredentials(): { passcode: number; discriminator: number } {
  let passcode = randomInt(1, 99_999_999);
  while (INVALID_PASSCODES.has(passcode)) passcode = randomInt(1, 99_999_999);
  return { passcode, discriminator: randomInt(0, 4096) };
}

type Credentials = ReturnType<typeof randomCommissioningCredentials>;
/** The device `commissionVirtualDevice` uses when the caller names none. */
let lastStarted: Credentials | undefined;

export type VirtualDevice = Credentials & {
  node: ServerNode;
  light: Endpoint<typeof OnOffLightDevice>;
  /** Fabric IDs the device lists, as decimal strings. */
  fabricIds(): string[];
  isOn(): boolean;
  stop(): Promise<void>;
};

/** Starts a commissionable OnOff light with its own storage and Matter port. */
export async function startVirtualDevice(storageDir: string, port: number): Promise<VirtualDevice> {
  Logger.level = LogLevel.ERROR;
  const environment = NodeJsEnvironment();
  environment.vars.set('path.root', storageDir);
  environment.vars.set('storage.path', storageDir);
  environment.vars.set('runtime.signals', false);
  environment.vars.set('runtime.unhandlederrors', false);
  const credentials = randomCommissioningCredentials();
  const node = await ServerNode.create({
    environment,
    id: 'virtual-device',
    network: { port },
    commissioning: credentials,
    productDescription: { deviceType: OnOffLightDevice.deviceType, name: 'Virtual light' },
    basicInformation: {
      vendorName: 'Attraccess tests',
      vendorId: VendorId(0xfff1),
      nodeLabel: 'Virtual light',
      productName: 'Virtual light',
      productLabel: 'Virtual light',
      productId: 0x8000,
      serialNumber: 'virtual-1',
      uniqueId: 'virtual-1',
      hardwareVersion: 1,
      hardwareVersionString: '1',
      softwareVersion: 1,
      softwareVersionString: '1',
    },
  });
  const light = new Endpoint(OnOffLightDevice, { id: 'light' });
  await node.add(light);
  await node.start();
  lastStarted = credentials;
  return {
    ...credentials,
    node,
    light,
    fabricIds: () => Object.values(node.state.operationalCredentials.fabrics).map((fabric) => String(fabric.fabricId)),
    isOn: () => light.state.onOff.onOff,
    stop: () => node.close(),
  };
}

/**
 * Commissions the virtual device into the controller's fabric and returns the node ID it received. Without `device`,
 * the device this process started last is commissioned.
 */
export async function commissionVirtualDevice(controller: MatterController, device?: Credentials): Promise<string> {
  const credentials = device ?? lastStarted;
  if (!credentials) throw new Error('No virtual device was started.');
  const peer = await controller.serverNode.peers.commission({
    passcode: credentials.passcode,
    discriminator: credentials.discriminator,
    timeout: Seconds(60),
  });
  return String(peer.state.commissioning.peerAddress?.nodeId);
}

async function onlinePeer(controller: MatterController, nodeId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const peer = [...controller.serverNode.peers].find(
      (candidate) => String(candidate.state.commissioning.peerAddress?.nodeId) === nodeId,
    );
    if (peer?.lifecycle.isOnline) return peer;
    if (Date.now() > deadline) throw new Error(`The commissioned node ${nodeId} did not come online.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Sends one OnOff `toggle` to the commissioned node, once it is reachable. */
export async function toggleDevice(controller: MatterController, nodeId: string, timeoutMs = 60_000): Promise<void> {
  const peer = await onlinePeer(controller, nodeId, timeoutMs);
  await peer.endpoints.for(1).commandsOf(OnOffClient).toggle();
}
