import { ResourceFlowNodeType } from '@attraccess/application-models';
import { openFlowCanvasDatabase, testActor } from '../../database/adapters/flows/flow-canvas-database.test-fixture';
import { unitOfWorkFor } from '../../database/adapters/shared-unit-of-work';
import { createBillingServiceFixture } from './fixtures/billing-service.test-fixture';
import { BillingService } from './billing.service';

jest.setTimeout(30_000);

/** ATT-1421: the balance check ahead of a project switch must not refuse what a flow of the switch would pay for. */
describe('Billing items below zero that a project switch can add', () => {
  let db: Awaited<ReturnType<typeof openFlowCanvasDatabase>>;
  beforeEach(async () => {
    db = await openFlowCanvasDatabase();
  });
  afterEach(() => db.source.destroy());

  const { INPUT_RESOURCE_USAGE_PROJECT_SWITCHED: SWITCHED, INPUT_RESOURCE_USAGE_STARTED: STARTED } =
    ResourceFlowNodeType;

  /** A trigger wired to a billing item; saved on the global flow. */
  const saveGlobalItem = (trigger: ResourceFlowNodeType, unitPrice: number) =>
    db.globalFlows.saveCanvas(
      db.flow.id,
      {
        nodes: [
          { id: 'trigger', type: trigger, position: { x: 0, y: 0 }, data: {} },
          {
            id: 'item',
            type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
            position: { x: 0, y: 0 },
            data: { name: 'Rebate', unitPrice, quantity: 1 },
          },
        ],
        edges: [{ id: 'edge', source: 'trigger', sourceHandle: 'output', target: 'item', targetHandle: 'input' }],
      },
      testActor,
    );

  const billing = () => {
    const parts = createBillingServiceFixture();
    return new BillingService(
      parts.ledgerStore,
      parts.configurationStore,
      parts.liveNotifications as never,
      db.resourceFlows,
      parts.email as never,
      parts.events as never,
      parts.metrics as never,
      parts.audit as never,
      parts.unitOfWork,
    );
  };

  it.each([
    ['an enabled global flow the switch runs, price below zero', SWITCHED, -500, true, true],
    ['an enabled global flow the switch runs, price above zero', SWITCHED, 500, true, false],
    ['a disabled global flow', SWITCHED, -500, false, false],
    ['a global flow the switch does not run', STARTED, -500, true, false],
  ] as const)('%s', async (_case, trigger, unitPrice, enabled, expected) => {
    await saveGlobalItem(trigger, unitPrice);
    await db.flows.update(db.flow.id, { enabled });

    await expect(billing().flowsMayLowerCharge(db.resource.id)).resolves.toBe(expected);
  });

  it('reads global flows inside the caller’s transaction', async () => {
    await saveGlobalItem(SWITCHED, -500);
    await db.flows.update(db.flow.id, { enabled: false });
    const uow = unitOfWorkFor(db.source);

    const seen = await uow.run(async (scope) => {
      await uow.handleOf(scope).update(db.flows.target, db.flow.id, { enabled: true });
      return billing().flowsMayLowerCharge(db.resource.id, scope);
    });

    expect(seen).toBe(true);
  });
});
