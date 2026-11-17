import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceFlowNodeType } from '@attraccess/application-models';
import {
  openFlowCanvasDatabase,
  startToHttpCanvas,
  testActor,
} from '../../database/adapters/flows/flow-canvas-database.test-fixture';

const T = ResourceFlowNodeType;

// Several real SQLite schema syncs; coverage runs on loaded CI machines exceed Jest's 5 s default.
describe('GlobalFlowsService with a database', () => {
  jest.setTimeout(30_000);
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  const owners = async () =>
    (await db.nodes.find({ order: { id: 'ASC' } })).map(({ id, resourceId, flowId }) => ({ id, resourceId, flowId }));

  it('rejects ids of a resource flow with 400 naming them and leaves both flows untouched', async () => {
    await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    db.audit.record.mockClear();

    const saving = db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('r'), testActor);
    await expect(saving).rejects.toBeInstanceOf(BadRequestException);
    expect(db.audit.record).not.toHaveBeenCalled();
    await expect(saving).rejects.toMatchObject({
      response: { nodeIds: expect.arrayContaining(['r-start', 'r-http']), edgeIds: ['r-edge'] },
    });
    expect(await owners()).toEqual([
      // The failed save rolled back: the global flow keeps its nodes.
      { id: 'g-http', resourceId: null, flowId: db.flow.id },
      { id: 'g-start', resourceId: null, flowId: db.flow.id },
      { id: 'r-http', resourceId: db.resource.id, flowId: null },
      { id: 'r-start', resourceId: db.resource.id, flowId: null },
    ]);
    expect(await db.edges.findOneByOrFail({ id: 'r-edge' })).toMatchObject({
      resourceId: db.resource.id,
      flowId: null,
    });
  });

  it('rejects ids of another global flow and saves its own ids again', async () => {
    const other = await db.flows.save(db.flows.create({ name: 'Other', enabled: true, scope: 'global' }));
    await db.globalFlows.saveCanvas(other.id, startToHttpCanvas('o'), testActor);
    await expect(db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('o'), testActor)).rejects.toMatchObject({
      response: { edgeIds: ['o-edge'] },
    });
    expect(await db.nodes.count({ where: { flowId: other.id } })).toBe(2);

    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    await expect(db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor)).resolves.toMatchObject({
      nodes: [{ id: 'g-start' }, { id: 'g-http' }],
    });
  });

  it('enforces exactly one owner per node and edge in the schema', async () => {
    const base = { type: T.INPUT_RESOURCE_USAGE_STARTED, position: { x: 0, y: 0 }, data: {} };
    await expect(db.nodes.insert({ ...base, id: 'none', resourceId: null, flowId: null })).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await expect(
      db.nodes.insert({ ...base, id: 'both', resourceId: db.resource.id, flowId: db.flow.id }),
    ).rejects.toThrow(/CHECK constraint failed/);
    await expect(
      db.edges.insert({ id: 'none', source: 'a', target: 'b', resourceId: null, flowId: null }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('does not list, count or open flows of another scope', async () => {
    await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
    // A future flow scope (ATT-1204) sharing the table.
    const foreign = await db.flows.save(db.flows.create({ name: 'Resource scoped', scope: 'resource' }));
    await db.nodes.insert({
      id: 'foreign-node',
      type: T.INPUT_RESOURCE_USAGE_STARTED,
      position: { x: 0, y: 0 },
      data: {},
      flowId: foreign.id,
      resourceId: null,
    });

    await expect(db.globalFlows.list()).resolves.toEqual([
      expect.objectContaining({ id: db.flow.id, nodeCount: 2, scope: 'global' }),
    ]);
    await expect(db.globalFlows.get(foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(db.globalFlows.getCanvas(foreign.id)).rejects.toBeInstanceOf(NotFoundException);
    db.audit.record.mockClear();
    await expect(db.globalFlows.update(foreign.id, { enabled: false }, testActor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(db.globalFlows.delete(foreign.id, testActor)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.audit.record).not.toHaveBeenCalled();
  });
});
