import { BadRequestException } from '@nestjs/common';
import {
  openFlowCanvasDatabase,
  startToHttpCanvas,
  testActor,
} from '../../database/adapters/flows/flow-canvas-database.test-fixture';

// Several real SQLite schema syncs; coverage runs on loaded CI machines exceed Jest's 5 s default.
describe('saving a resource flow with ids owned by another flow', () => {
  jest.setTimeout(30_000);
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  it('rejects ids of a global flow with 400 naming them and leaves both flows untouched', async () => {
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    db.audit.record.mockClear();

    const saving = db.resourceFlows.saveResourceFlow(
      db.resource.id,
      {
        nodes: [...startToHttpCanvas('g').nodes, ...startToHttpCanvas('r2').nodes],
        edges: startToHttpCanvas('g').edges,
      },
      testActor,
    );
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    await expect(saving).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([expect.stringContaining('g-start'), expect.stringContaining('g-edge')]),
        nodeIds: expect.arrayContaining(['g-start', 'g-http']),
        edgeIds: ['g-edge'],
      },
    });
    expect(db.audit.record).not.toHaveBeenCalled();

    const owners = async () =>
      (await db.nodes.find({ order: { id: 'ASC' } })).map(({ id, resourceId, flowId }) => ({ id, resourceId, flowId }));
    expect(await owners()).toEqual([
      { id: 'g-http', resourceId: null, flowId: db.flow.id },
      { id: 'g-start', resourceId: null, flowId: db.flow.id },
      // The failed save rolled back: the resource's own flow is still there.
      { id: 'r-http', resourceId: db.resource.id, flowId: null },
      { id: 'r-start', resourceId: db.resource.id, flowId: null },
    ]);
    expect(await db.edges.findOneByOrFail({ id: 'g-edge' })).toMatchObject({ flowId: db.flow.id, resourceId: null });
  });

  it('saves its own ids again', async () => {
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    await expect(
      db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor),
    ).resolves.toMatchObject({
      nodes: [{ id: 'r-start' }, { id: 'r-http' }],
    });
    expect(await db.nodes.count({ where: { resourceId: db.resource.id } })).toBe(2);
  });

  it('returns saved nodes and edges as plain records without the resource relation', async () => {
    const saved = await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    expect(saved.nodes[0]).toMatchObject({ id: 'r-start', resourceId: db.resource.id, flowId: null });
    expect(saved.nodes[0]).not.toHaveProperty('resource');
    expect(saved.edges[0]).toMatchObject({ id: 'r-edge', resourceId: db.resource.id, flowId: null });
    expect(saved.edges[0]).not.toHaveProperty('resource');
  });

  it('keeps the previous canvas when persisting the new one fails after the old rows were deleted', async () => {
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    // The audit row is written after the canvas rows, inside the same unit of work.
    db.audit.record.mockRejectedValueOnce(new Error('database rejected write'));

    await expect(
      db.resourceFlows.saveResourceFlow(db.resource.id, { nodes: [], edges: [] }, testActor),
    ).rejects.toThrow('database rejected write');

    expect(await db.nodes.count({ where: { resourceId: db.resource.id } })).toBe(2);
    expect(await db.edges.count({ where: { resourceId: db.resource.id } })).toBe(1);
  });
});
