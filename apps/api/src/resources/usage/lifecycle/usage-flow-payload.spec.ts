import type { UsageSession } from '@attraccess/application-models';
import { usageFlowPayload } from './usage-flow-payload';

const session = (user: Record<string, unknown>): UsageSession =>
  ({ id: 1, userId: 5, resource: { id: 2, name: 'Laser' }, user }) as unknown as UsageSession;

describe('usageFlowPayload', () => {
  it('gives flows first name, last name and display name next to the username', () => {
    const { user } = usageFlowPayload(session({ id: 5, username: 'ada', firstName: 'Ada', lastName: 'Lovelace' }));
    expect(user).toMatchObject({
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
    });
  });

  it('falls back to the username without names', () => {
    const { user } = usageFlowPayload(session({ id: 5, username: 'ada' }));
    expect(user).toMatchObject({ firstName: null, lastName: null, displayName: 'ada' });
  });
});
