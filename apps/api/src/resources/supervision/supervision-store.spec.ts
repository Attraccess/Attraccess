import { decodeRequest, encodeRequest, type StoredSupervisionRequest } from './supervision-store';

const request = (requester: StoredSupervisionRequest['requester']): StoredSupervisionRequest => ({
  id: 'r1',
  resourceId: 5,
  requester,
  supervisorUserId: null,
  eligibleSupervisorIds: [2, 3],
  dto: { estimatedDurationMinutes: 30 },
  canAskDuration: true,
  createdAt: 1_000,
  expiresAt: 31_000,
  readerId: 4,
  originInstance: 'a|1',
});

/** How a request travels through Valkey to the instance that approves it (ATT-1163). */
describe('supervision request encoding', () => {
  it("keeps the requester's effectivePermissions a Set, so permission checks on another instance see it", () => {
    const requester = {
      id: 1,
      username: 'requester',
      effectivePermissions: new Set(['resources.manage', 'users.manage']),
    } as StoredSupervisionRequest['requester'];

    const decoded = decodeRequest(encodeRequest(request(requester)));

    const permissions = (decoded.requester as unknown as { effectivePermissions: unknown }).effectivePermissions;
    expect(permissions).toBeInstanceOf(Set);
    expect([...(permissions as Set<string>)].sort()).toEqual(['resources.manage', 'users.manage']);
    expect({ ...decoded, requester: { id: decoded.requester.id } }).toEqual({
      ...request(requester),
      requester: { id: 1 },
    });
  });

  it('carries a requester without permissions unchanged', () => {
    const requester = { id: 1, username: 'requester' };

    expect(decodeRequest(encodeRequest(request(requester)))).toEqual(request(requester));
  });

  it('does not change the request it encodes', () => {
    const permissions = new Set(['resources.manage']);
    const original = request({ id: 1, username: 'requester', effectivePermissions: permissions } as never);

    encodeRequest(original);

    expect((original.requester as unknown as { effectivePermissions: unknown }).effectivePermissions).toBe(permissions);
  });
});
