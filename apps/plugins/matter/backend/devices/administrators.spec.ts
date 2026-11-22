import { createHarness, inventory, node, type Harness } from '../testing/devices-harness.test-utils';
import { nodeDetailView } from './views';

const OWN = { fabricIndex: 1, vendorId: 0xfff1, fabricLabel: 'Attraccess', isOwn: true };
const APPLE = { fabricIndex: 2, vendorId: 4_937, fabricLabel: 'Home', isOwn: false };

describe('the device’s other administrators', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  const detail = async () => {
    const row = await h.tables.nodes.findOne();
    return nodeDetailView(await h.lifecycle.getNode(row?.id as string));
  };

  it('stores what the sidecar lists, shows it read-only on the detail, and follows later changes', async () => {
    await h.reconcile(inventory('1', [node('5', { administrators: [OWN, APPLE] })]));
    expect((await detail()).administrators).toEqual([OWN, APPLE]);
    await h.reconcile(inventory('1', [node('5', { administrators: [OWN] })]));
    expect((await detail()).administrators).toEqual([OWN]);
    expect((await h.tables.nodes.findOne())?.administrators).toBe(JSON.stringify([OWN]));
  });

  it('reads as an empty list for a node from before version 3, and never attributes an external change to a user', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    await h.tables.nodes.update({ nodeId: '5' }, { administrators: null });
    expect((await detail()).administrators).toEqual([]);
    expect((await detail()).attestationOverridden).toBe(false);
    // Reconciliation records nothing about an administrator as a user action.
    await h.reconcile(inventory('1', [node('5', { administrators: [OWN, APPLE] })]));
    for (const call of h.audit.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('Home');
    }
  });
});
