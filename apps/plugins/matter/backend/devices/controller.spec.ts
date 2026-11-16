import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, inventory, node, type Harness } from '../testing/devices-harness.test-utils';
import { MatterDevicesController } from './controller';
import { MatterEndpoint } from './entities';

const request = { user: { id: 7, authenticationMethod: 'session' } } as unknown as AuthenticatedRequest;

describe('Matter devices controller', () => {
  let h: Harness;
  let controller: MatterDevicesController;
  beforeEach(async () => {
    h = await createHarness();
    controller = new MatterDevicesController(h.lifecycle, h.reconciliation, h.state);
  });
  afterEach(() => h.close());

  it('is guarded by the plugin management permission on the class, with the ATT-1003 marker', () => {
    const source = readFileSync(join(__dirname, 'controller.ts'), 'utf8');
    expect(source).toContain("@Auth('system.plugins.manage')");
    expect(source.match(/@Auth\(/g)).toHaveLength(1);
    expect(source).toContain('TODO(ATT-1003)');
    expect(source).toContain("@Controller('matter')");
  });

  it('exposes no endpoint that sends a command to a device', () => {
    const source = readFileSync(join(__dirname, 'controller.ts'), 'utf8');
    expect(source).not.toMatch(/commands\.invoke|recordRequest|invoke/);
  });

  it('triggers reconciliation, reports its status, and lists and reads nodes', async () => {
    expect(await controller.reconciliationStatus()).toMatchObject({ lastResult: null });
    h.sidecar.list = inventory('1', [node('5')]);
    expect(await controller.trigger(request)).toMatchObject({ lastResult: 'applied', sidecarFabricId: '1' });
    expect((h.audit.mock.calls[0] as unknown as [object])[0]).toMatchObject({ principal: { userId: 7 } });

    const [listed] = await controller.listNodes({});
    expect(listed).toMatchObject({
      nodeId: '5',
      lifecycleState: 'unclaimed',
      identity: { vendorName: 'Acme', attestation: { status: 'verified' } },
      metadata: { displayName: null },
    });
    expect(await controller.listNodes({ lifecycleState: 'claimed' })).toEqual([]);
    const detail = await controller.getNode(listed.id);
    expect(detail.endpoints[1]).toMatchObject({
      endpointId: 1,
      profile: 'dimmable_actuator',
      deviceTypes: [{ deviceTypeId: 266, revision: 3 }],
    });
    expect(detail.endpoints[1].capabilities.map((c) => c.capability)).toEqual(['levelControl', 'onOff']);
  });

  it('serves the endpoint state with source, times, freshness, quality and correlation', async () => {
    h.sidecar.list = inventory('1', [node('5')]);
    await controller.trigger(request);
    const endpoint = await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ endpointId: 1 });
    await h.state.ingestReport({
      nodeId: '5',
      endpointId: 1,
      clusterId: 6,
      attributeId: 0,
      value: true,
      observedAt: new Date().toISOString(),
      source: 'read',
    });
    await h.state.recordRequest({
      endpointRef: endpoint.id,
      stateKey: 'onOff.onOff',
      clusterId: 6,
      commandId: 1,
      value: false,
      requestedBy: 7,
      requestId: randomUUID(),
      correlationId: 'corr',
    });
    const { endpointRef, states } = await controller.endpointState(endpoint.id);
    expect(endpointRef).toBe(endpoint.id);
    expect(states[0]).toMatchObject({
      stateKey: 'onOff.onOff',
      reported: {
        value: true,
        source: 'read',
        quality: 'good',
        observedAt: expect.any(String),
        receivedAt: expect.any(String),
      },
      freshness: 'fresh',
      requested: {
        value: false,
        requestedAt: expect.any(String),
        correlationId: 'corr',
        requestId: expect.any(String),
      },
      command: { state: 'requested' },
      confirmed: false,
      externalChange: null,
      fault: null,
      uncertainActuation: false,
    });
    await expect(controller.endpointState(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates every body and ID with Zod', async () => {
    h.sidecar.list = inventory('1', [node('5')]);
    await controller.trigger(request);
    const { id } = (await controller.listNodes({}))[0];
    const messages = async (call: Promise<unknown>) =>
      ((await call.catch((error: BadRequestException) => error)) as BadRequestException).getResponse();
    expect(await messages(controller.getNode('not-a-uuid'))).toMatchObject({
      message: [expect.stringMatching(/^id: /)],
    });
    expect(await messages(controller.archive('x', request))).toMatchObject({
      message: [expect.stringMatching(/^id: /)],
    });
    expect(await messages(controller.listNodes({ foo: '1' }))).toMatchObject({
      message: [expect.stringMatching(/^query: /)],
    });
    await expect(controller.listNodes({ lifecycleState: 'bogus' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.relink(id, { sourceNodeId: id, confirmIdentityMismatch: 'yes' }, request),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateNode(id, {}, request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateNode(id, { displayName: 'x'.repeat(101) }, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.updateNode(id, { description: 'x'.repeat(501) }, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Protocol fields cannot be patched.
    await expect(controller.updateNode(id, { vendorName: 'x' }, request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.updateEndpoint(id, { profile: 'lock' }, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.relink(id, { sourceNodeId: 'x' }, request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.forceRemove(id, {}, request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.forceRemove(id, { confirm: false }, request)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.claim(id, { displayName: '' }, request)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runs the lifecycle over REST-shaped calls and maps invalid transitions to 409', async () => {
    h.sidecar.list = inventory('1', [node('5')]);
    await controller.trigger(request);
    const { id } = (await controller.listNodes({}))[0];
    expect(await controller.claim(id, undefined, request)).toMatchObject({ lifecycleState: 'claimed' });
    await expect(controller.claim(id, {}, request)).rejects.toBeInstanceOf(ConflictException);
    expect(await controller.updateNode(id, { displayName: 'Press', location: 'Lab' }, request)).toMatchObject({
      metadata: { displayName: 'Press', location: 'Lab', description: null },
    });
    h.sidecar.list = inventory('1', []);
    await controller.trigger(request);
    expect(await controller.archive(id, request)).toMatchObject({ lifecycleState: 'archived' });
    expect(await controller.restore(id, request)).toMatchObject({ lifecycleState: 'detached' });
    expect(await controller.forceRemove(id, { confirm: true }, request)).toMatchObject({ lifecycleState: 'removed' });
    expect(await controller.listNodes({})).toEqual([]);
    expect(await controller.listNodes({ includeInactive: 'false' })).toEqual([]);
    expect(await controller.listNodes({ includeInactive: 'true' })).toHaveLength(1);
  });

  it('reports the event counters with the reconciliation status', async () => {
    await h.state.ingestReport({
      nodeId: '99',
      endpointId: 1,
      clusterId: 6,
      attributeId: 0,
      value: true,
      observedAt: new Date().toISOString(),
      source: 'read',
    });
    expect(await controller.reconciliationStatus()).toMatchObject({
      lastResult: null,
      events: { applied: 0, unknownEndpoint: 1 },
    });
  });
});
