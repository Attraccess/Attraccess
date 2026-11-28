import { ResourceFormAction } from '@attraccess/application-models';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { InsufficientBalanceError } from '../../../../billing/errors/insufficient-balance.error';
import { MachineBusyError } from '../../../../resources/usage/errors/machine-busy.error';
import { NoSessionToSwitchError } from '../../../../resources/usage/errors/no-session-to-switch.error';
import { AttractapEventType, type AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapProjectSwitchHandler } from './project-switch.handler';

describe('AttractapProjectSwitchHandler', () => {
  const user = { id: 5, username: 'ada' };

  function setUp(state: Record<string, unknown> = { projectSwitch: true }) {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const services = {
      resourceUsageService: {
        assertSessionProjectSwitchable: jest.fn().mockResolvedValue(undefined),
        getActiveSessionsForResource: jest.fn().mockResolvedValue([{ id: 40, userId: 99 }]),
        switchSessionProject: jest.fn().mockResolvedValue({ id: 12, project: { name: 'Rocket' } }),
      },
      usersService: { findOne: jest.fn().mockResolvedValue(user) },
      sumUpService: { getIsEnabled: jest.fn().mockResolvedValue(true) },
      resourceActionGuard: { validateResourceAction: jest.fn().mockResolvedValue(true) },
      resourceListService: { sendResourceListToSocket: jest.fn() },
      formsHandler: { ensureFormsSatisfied: jest.fn().mockResolvedValue([]), clearFormDraft: jest.fn() },
      cardSessions: { resume: jest.fn(), hold: jest.fn(() => jest.fn()) },
    };
    const handler: AttractapProjectSwitchHandler = Object.assign(
      Object.create(AttractapProjectSwitchHandler.prototype),
      services,
      { logger: new Logger('test') },
    );
    const socket = {
      state: { verifiedUserId: user.id, ...state },
      sendMessage: jest.fn().mockResolvedValue(true),
    } as unknown as AuthenticatedWebSocket;
    const request = (payload: Record<string, unknown> = {}) =>
      handler.handleSwitchSessionProject(socket, {
        payload: { resourceId: 10, usageId: 11, projectId: 7, requestId: 3, cardSessionId: 'card', ...payload },
      } as never);
    const replies = () =>
      (socket.sendMessage as jest.Mock).mock.calls.map((call) => ({
        type: call[0].data.type,
        ...call[0].data.payload,
      }));
    return { services, socket, request, replies };
  }

  afterEach(() => jest.restoreAllMocks());

  it('rejects the event of a reader that did not announce the capability', async () => {
    const { services, request, replies } = setUp({});

    await request();

    expect(replies()).toEqual([
      { type: AttractapEventType.SWITCH_SESSION_PROJECT, requestId: 3, error: 'PROJECT_SWITCH_NOT_SUPPORTED' },
    ]);
    expect(services.resourceUsageService.switchSessionProject).not.toHaveBeenCalled();
  });

  it('switches the card holder’s session with the collected forms and names the new project', async () => {
    const { services, request, replies } = setUp();
    const forms = [{ formId: 1, answers: [] }];
    services.formsHandler.ensureFormsSatisfied.mockResolvedValue(forms);

    await request();

    expect(services.formsHandler.ensureFormsSatisfied).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 10, action: ResourceFormAction.PROJECT_SWITCH, requestId: 3 }),
    );
    expect(services.resourceUsageService.switchSessionProject).toHaveBeenCalledWith(
      10,
      user,
      { projectId: 7, usageId: 11, formSubmissions: forms },
      { auditOrigin: { id: 5, authenticationMethod: null } },
    );
    expect(services.formsHandler.clearFormDraft).toHaveBeenCalledWith(
      expect.anything(),
      10,
      ResourceFormAction.PROJECT_SWITCH,
    );
    expect(replies()).toEqual([
      expect.objectContaining({ success: true, usageId: 12, projectName: 'Rocket', requestId: 3 }),
    ]);
  });

  it('passes "no project" on as null', async () => {
    const { services, request } = setUp();

    await request({ projectId: null });

    expect(services.resourceUsageService.switchSessionProject.mock.calls[0][2]).toMatchObject({ projectId: null });
  });

  it.each([[undefined], [0], [-3], ['7']])('refuses the project id %p', async (projectId) => {
    const { services, request, replies } = setUp();

    await request({ projectId });

    expect(replies()[0]).toMatchObject({ error: 'INVALID_PROJECT_ID' });
    expect(services.resourceUsageService.switchSessionProject).not.toHaveBeenCalled();
  });

  it('waits for the required forms before switching', async () => {
    const { services, request, replies } = setUp();
    services.formsHandler.ensureFormsSatisfied.mockResolvedValue(null);

    await request();

    expect(services.resourceUsageService.switchSessionProject).not.toHaveBeenCalled();
    expect(replies()).toEqual([]);
  });

  it('asks for forms only after checking that the shown session can be switched to the target', async () => {
    const { services, request } = setUp();

    await request();

    expect(services.resourceUsageService.assertSessionProjectSwitchable).toHaveBeenCalledWith(10, user, {
      projectId: 7,
      usageId: 11,
    });
    expect(services.resourceUsageService.assertSessionProjectSwitchable.mock.invocationCallOrder[0]).toBeLessThan(
      services.formsHandler.ensureFormsSatisfied.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['the session ended', new NoSessionToSwitchError(), 'NoOwnActiveSessionError'],
    [
      'the target is the current project',
      new BadRequestException('The session already belongs to this project'),
      'The session already belongs to this project',
    ],
  ])('answers without asking for forms when %s', async (_case, error, expected) => {
    const { services, request, replies } = setUp();
    services.resourceUsageService.assertSessionProjectSwitchable.mockRejectedValue(error);

    await request();

    expect(replies()).toEqual([expect.objectContaining({ error: expected, requestId: 3 })]);
    expect(services.formsHandler.ensureFormsSatisfied).not.toHaveBeenCalled();
    expect(services.resourceUsageService.switchSessionProject).not.toHaveBeenCalled();
    expect(services.resourceListService.sendResourceListToSocket).toHaveBeenCalled();
  });

  it.each([
    ['a session that ended while the switch was asked for', new NoSessionToSwitchError(), 'NoOwnActiveSessionError'],
    ['a project that is gone', new NotFoundException('Project not found'), 'Project not found'],
    ['a failed meter reading', new Error('METER_SWITCH_FAILED: "Energy": meter offline'), 'METER_SWITCH_FAILED'],
    ['a busy machine', new MachineBusyError(), new MachineBusyError().message],
  ])('answers %s and refreshes the row', async (_case, error, expected) => {
    const { services, request, replies } = setUp();
    services.resourceUsageService.switchSessionProject.mockRejectedValue(error);

    await request();

    expect(replies()[0]).toMatchObject({ error: expected });
    expect(services.resourceListService.sendResourceListToSocket).toHaveBeenCalled();
    expect(services.formsHandler.clearFormDraft).not.toHaveBeenCalled();
  });

  it('does not claim there is no own session when the named one runs on as another record', async () => {
    const { services, request, replies } = setUp();
    services.resourceUsageService.assertSessionProjectSwitchable.mockRejectedValue(new NoSessionToSwitchError());
    services.resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ id: 12, userId: user.id }]);

    await request();

    // The reader has no text of its own for this code: it shows its general "try again" on the refreshed row.
    expect(replies()).toEqual([expect.objectContaining({ error: 'PROJECT_SWITCH_SESSION_CHANGED' })]);
    expect(services.resourceListService.sendResourceListToSocket).toHaveBeenCalled();
  });

  it('tells the reader about an insufficient balance, with whether it can top up', async () => {
    const { services, request, replies } = setUp();
    services.resourceUsageService.switchSessionProject.mockRejectedValue(new InsufficientBalanceError());

    await request();

    expect(replies()[0]).toMatchObject({ error: 'INSUFFICIENT_BALANCE', sumUpEnabled: true });
  });
});
