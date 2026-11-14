import { Bytes, Logger, LogLevel, ServerNode, VendorId } from '@matter/main';
import { ControllerBehavior } from '@matter/main/node';
import { FabricAuthority } from '@matter/main/protocol';
import { NodeId } from '@matter/main/types';
import { NodeJsEnvironment } from '@matter/nodejs';
import { sha256Hex } from './archive';
import { CONTROLLER_NODE_ID, type FabricFacts, type StorageLayout } from './storage';

/** The Matter test vendor ID. Production vendor IDs are assigned by the CSA; a controller fabric may use the test one. */
const ADMIN_VENDOR_ID = VendorId(0xfff1);

export type ControllerOptions = {
  layout: StorageLayout;
  /** Node IDs are allocated from here on. */
  nodeIdFloor?: number;
  /** UDP port of the controller's Matter endpoint. 0 picks a free one. */
  port: number;
};

/**
 * The matter.js controller of the sidecar: one `ServerNode` carrying the controller behaviour, whose storage is the
 * `matter/controller` directory. Starting it opens Matter networking (mDNS, UDP) and reconnects to commissioned nodes.
 * It never creates the fabric by itself; `createFabric` is the only place that does.
 */
export class MatterController {
  #node: ServerNode | undefined;

  constructor(private readonly options: ControllerOptions) {}

  get running(): boolean {
    return this.#node !== undefined;
  }

  /**
   * The matter.js node. Exposed for the test-only commissioning harness (`src/testing`), which drives the controller
   * from test code. No HTTP route or environment flag reaches it.
   */
  get serverNode(): ServerNode {
    if (!this.#node) throw new Error('The Matter controller is not running.');
    return this.#node;
  }

  async start(): Promise<void> {
    if (this.#node) return;
    // Errors only: matter.js also logs development placeholder values and operational detail that an operator does not need.
    Logger.level = LogLevel.ERROR;
    const environment = NodeJsEnvironment();
    environment.vars.set('path.root', this.options.layout.matterDir);
    environment.vars.set('storage.path', this.options.layout.matterDir);
    environment.vars.set('runtime.signals', false);
    environment.vars.set('runtime.unhandlederrors', false);
    const node = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
      environment,
      id: CONTROLLER_NODE_ID,
      network: { port: this.options.port },
      controller: {
        adminFabricLabel: 'Attraccess',
        ble: false,
        ...(this.options.nodeIdFloor === undefined ? {} : { nextNodeId: NodeId(BigInt(this.options.nodeIdFloor)) }),
      },
    });
    try {
      await node.start();
    } catch (error) {
      await node.close().catch(() => undefined);
      throw error;
    }
    this.#node = node;
  }

  async stop(): Promise<void> {
    const node = this.#node;
    this.#node = undefined;
    if (node) await node.close();
  }

  /** The controller fabric as matter.js loaded it, or undefined when there is none. */
  async loadedFacts(): Promise<FabricFacts | undefined> {
    const authority = this.serverNode.env.get(FabricAuthority);
    await authority.construction;
    const fabric = authority.fabrics[0];
    if (!fabric) return undefined;
    return {
      fabricId: String(fabric.fabricId),
      rootCertFingerprint: sha256Hex(Buffer.from(Bytes.of(fabric.rootCert))),
    };
  }

  /** Creates the root CA, the controller certificate chain, the node identity and the IPK. Idempotent per root CA. */
  async createFabric(label: string): Promise<FabricFacts> {
    const authority = this.serverNode.env.get(FabricAuthority);
    await authority.construction;
    await authority.defaultFabric({ adminFabricLabel: label, adminVendorId: ADMIN_VENDOR_ID }, false);
    const facts = await this.loadedFacts();
    if (!facts) throw new Error('The fabric was not created.');
    return facts;
  }
}
