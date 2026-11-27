import { registerResourceListServiceFixture } from './service.test-fixture';

/** ATT-1421: which readers and card holders are offered to switch the project of a running session. */
describe('resource list payload: project switch', () => {
  const fixture = registerResourceListServiceFixture();
  const startTime = new Date('2026-06-04T11:00:00.000Z');
  const sessionStartTime = new Date('2026-06-04T09:00:00.000Z');
  const user = { username: 'active-user', firstName: 'Ada', lastName: 'Active' };

  async function ownRow(
    state: Record<string, unknown>,
    session: Record<string, unknown>,
    ownedProjects = 1,
    userId = 1,
  ) {
    fixture.attractapService.findReaderById.mockResolvedValue(
      fixture.createReaderFixture({ resources: [{ id: 10, name: 'Laser', type: 'machine' }] }),
    );
    fixture.resourceUsageService.getActiveSessions.mockResolvedValue(
      new Map([[10, [{ id: 99, userId: 1, user, startTime, ...session }]]]),
    );
    (fixture.service as unknown as { projectsService: unknown }).projectsService = {
      getTotalCount: jest.fn().mockResolvedValue(ownedProjects),
    };
    const socket = fixture.createMockSocket({ state: { verifiedUserId: userId, ...state } });
    await fixture.service.sendResourceListToSocket(socket);
    return socket.sendMessage.mock.calls[0][0].data.payload.resources[0];
  }

  it('offers it to a capable reader on the card holder’s own session, with the project it is booked to', async () => {
    const row = await ownRow({ projectSwitch: true }, { projectId: 7, project: { name: 'Rocket' } });

    expect(row).toMatchObject({ canSwitchProject: true, ownProjectId: 7, ownProjectName: 'Rocket' });
  });

  it('never offers it to a reader that did not announce the capability', async () => {
    const row = await ownRow({}, { projectId: 7, project: { name: 'Rocket' } });

    expect(row).not.toHaveProperty('canSwitchProject');
    expect(row).not.toHaveProperty('ownProjectName');
  });

  it('never offers it on somebody else’s session', async () => {
    const row = await ownRow({ projectSwitch: true }, { projectId: 7, project: { name: 'Rocket' } }, 1, 2);

    expect(row).not.toHaveProperty('canSwitchProject');
  });

  it('offers a session without a project only to somebody who has one to switch to', async () => {
    expect(await ownRow({ projectSwitch: true }, { projectId: null }, 0)).not.toHaveProperty('canSwitchProject');
  });

  it('offers a session without a project to a project member', async () => {
    expect(await ownRow({ projectSwitch: true }, { projectId: null }, 2)).toMatchObject({
      canSwitchProject: true,
      ownProjectId: null,
      ownProjectName: null,
    });
  });

  it('keeps showing since when the session runs after a switch', async () => {
    const row = await ownRow({ projectSwitch: true }, { projectId: 7, sessionStartTime });

    expect(row.ownUsageSession.startTime).toBe(sessionStartTime.toISOString());
  });
});
