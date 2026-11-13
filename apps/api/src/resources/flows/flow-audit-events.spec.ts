import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { auditActorOf } from '../../audit/recorder/audit-event';
import { projectAuditRow } from '../../audit/recorder/audit-row';
import { openFlowCanvasDatabase, startToHttpCanvas, testActor } from './flow-canvas-database.test-fixture';

const T = ResourceFlowNodeType;

/** The flow services against a real database; the audit recorder is a stand-in whose events are projected. */
describe('flow audit events', () => {
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  const events = () => db.audit.record.mock.calls.map(([event]) => event);
  /** Whether the next recorded event is written while the caller's transaction is still open. */
  const recordsInTransaction = () => {
    const state = { active: false };
    db.audit.record.mockImplementationOnce(async (_event, manager) => {
      state.active = manager?.queryRunner?.isTransactionActive === true;
      return { status: 'recorded' };
    });
    return state;
  };
  const lastEvent = () => {
    const event = events().at(-1);
    if (!event) throw new Error('no audit event was recorded');
    return event;
  };

  describe('resource flow canvas save', () => {
    const tokenActor = auditActorOf({ id: 3, authenticationMethod: 'api-token', apiTokenId: 12 });

    it('records an added canvas with actor, resource subject, counts and an empty before snapshot', async () => {
      await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), tokenActor);

      expect(events()).toHaveLength(1);
      expect(lastEvent()).toMatchObject({
        domain: 'resource',
        action: 'resource_flow.updated',
        actor: { id: 3, authenticationMethod: 'api-token', apiTokenId: 12 },
        subject: { type: 'resource', id: db.resource.id },
        details: {
          'before.nodeCount': 0,
          'after.nodeCount': 2,
          'before.edgeCount': 0,
          'after.edgeCount': 1,
          addedNodes: JSON.stringify([
            { id: 'r-start', type: T.INPUT_RESOURCE_USAGE_STARTED },
            { id: 'r-http', type: T.OUTPUT_HTTP_SEND_REQUEST },
          ]),
          addedEdges: '["r-edge"]',
          removedNodes: '[]',
          snapshotDetail: 'full',
        },
      });
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('records emptying a canvas with a snapshot that can rebuild it, without secrets', async () => {
      const canvas = startToHttpCanvas('r');
      canvas.nodes[1].data = { url: 'https://example.com', method: 'POST', headers: { Authorization: 'Bearer hush' } };
      await db.resourceFlows.saveResourceFlow(db.resource.id, canvas, testActor);
      db.audit.record.mockClear();

      await db.resourceFlows.saveResourceFlow(db.resource.id, { nodes: [], edges: [] }, testActor);

      const { details } = lastEvent();
      expect(details).toMatchObject({ 'before.nodeCount': 2, 'after.nodeCount': 0, removedEdges: '["r-edge"]' });
      const snapshot = JSON.parse(details['before.snapshot'] as string);
      expect(snapshot.nodes.map((n: { id: string; type: string }) => [n.id, n.type])).toEqual(
        expect.arrayContaining([
          ['r-start', T.INPUT_RESOURCE_USAGE_STARTED],
          ['r-http', T.OUTPUT_HTTP_SEND_REQUEST],
        ]),
      );
      expect(snapshot.nodes.find((n: { id: string }) => n.id === 'r-http').data).toEqual({
        url: 'https://example.com',
        method: 'POST',
        headers: { Authorization: '[redacted]' },
      });
      expect(snapshot.edges).toEqual([
        { id: 'r-edge', source: 'r-start', sourceHandle: 'output', target: 'r-http', targetHandle: 'input' },
      ]);
      expect(JSON.stringify(details)).not.toContain('hush');
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('records nothing for an unchanged canvas, also when only positions changed', async () => {
      await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
      db.audit.record.mockClear();

      const moved = startToHttpCanvas('r');
      moved.nodes.forEach((node, index) => (node.position = { x: 100 * index, y: 50 }));
      await db.resourceFlows.saveResourceFlow(db.resource.id, moved, testActor);
      expect(db.audit.record).not.toHaveBeenCalled();
    });

    it('records a changed node by id and type', async () => {
      await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
      const edited = startToHttpCanvas('r');
      edited.nodes[1].data = { url: 'https://example.com/changed', method: 'POST' };
      await db.resourceFlows.saveResourceFlow(db.resource.id, edited, testActor);

      expect(lastEvent().details).toMatchObject({
        changedNodes: JSON.stringify([{ id: 'r-http', type: T.OUTPUT_HTTP_SEND_REQUEST }]),
        addedNodes: '[]',
        removedNodes: '[]',
      });
    });

    it('writes the audit row through the save transaction, so a failing audit rolls the save back', async () => {
      const inTransaction = recordsInTransaction();
      await db.resourceFlows.saveResourceFlow(db.resource.id, startToHttpCanvas('r'), testActor);
      expect(inTransaction.active).toBe(true);

      db.audit.record.mockRejectedValueOnce(new Error('audit transaction aborted'));
      await expect(
        db.resourceFlows.saveResourceFlow(db.resource.id, { nodes: [], edges: [] }, testActor),
      ).rejects.toThrow('audit transaction aborted');
      expect(await db.nodes.count({ where: { resourceId: db.resource.id } })).toBe(2);
    });
  });

  describe('global flows', () => {
    const subject = (id: number) => ({ type: 'flow', id });

    it('records a created flow', async () => {
      const flow = await db.globalFlows.create({ name: ' Door bell ', description: 'rings' }, testActor);
      expect(lastEvent()).toMatchObject({
        domain: 'resource',
        action: 'flow.created',
        actor: testActor,
        subject: subject(flow.id),
        details: { 'after.name': 'Door bell', 'after.enabled': 1, 'after.description': 'rings' },
      });
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('records only the changed fields of an update, and nothing when nothing changed', async () => {
      await db.globalFlows.update(db.flow.id, { name: 'Notify', enabled: true }, testActor);
      expect(db.audit.record).not.toHaveBeenCalled();

      await db.globalFlows.update(db.flow.id, { name: 'Alarm', enabled: false }, testActor);
      expect(lastEvent()).toMatchObject({
        action: 'flow.updated',
        subject: subject(db.flow.id),
        details: {
          'before.name': 'Notify',
          'after.name': 'Alarm',
          'before.enabled': 1,
          'after.enabled': 0,
          changedFields: '["name","enabled"]',
        },
      });
      expect(lastEvent().details).not.toHaveProperty('before.description');
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('bounds long names and descriptions of an update', async () => {
      await db.globalFlows.update(db.flow.id, { name: '🙂'.repeat(3000), description: 'd'.repeat(9000) }, testActor);
      expect(Buffer.byteLength(JSON.stringify(lastEvent().details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('records a canvas save with the flow name, and nothing for a no-op save', async () => {
      await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
      expect(lastEvent()).toMatchObject({
        action: 'flow.canvas_updated',
        subject: subject(db.flow.id),
        details: { flowName: 'Notify', 'after.nodeCount': 2, snapshotDetail: 'full' },
      });
      expect(projectAuditRow(lastEvent())).not.toBeNull();

      db.audit.record.mockClear();
      await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
      expect(db.audit.record).not.toHaveBeenCalled();
    });

    it('records a delete with the canvas as it was before the cascade', async () => {
      await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
      db.audit.record.mockClear();

      await db.globalFlows.delete(db.flow.id, testActor);

      expect(await db.nodes.count({ where: { flowId: db.flow.id } })).toBe(0);
      expect(lastEvent()).toMatchObject({
        action: 'flow.deleted',
        subject: subject(db.flow.id),
        details: { 'before.name': 'Notify', 'before.enabled': 1, 'before.nodeCount': 2, 'before.edgeCount': 1 },
      });
      const snapshot = JSON.parse(lastEvent().details['before.snapshot'] as string);
      expect(snapshot.nodes.map((n: { id: string }) => n.id).sort()).toEqual(['g-http', 'g-start']);
      expect(projectAuditRow(lastEvent())).not.toBeNull();
    });

    it('records a canvas save inside its transaction', async () => {
      const inTransaction = recordsInTransaction();
      await db.globalFlows.saveCanvas(db.flow.id, startToHttpCanvas('g'), testActor);
      expect(inTransaction.active).toBe(true);
    });
  });
});
