import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { emitPluginSessionEnded, emitPluginSessionStart } from './plugin-usage-events';

describe('plugin usage events', () => {
  const emit = jest.fn();
  const logger = { error: jest.fn() };
  const pluginEvents = { emit };
  const startTime = new Date('2030-01-01T10:00:00Z');
  const transitionTime = new Date('2030-01-01T11:00:00Z');
  const newSession = { id: 20, resourceId: 3, userId: 7, startTime: transitionTime };
  const oldSession = { id: 10, resourceId: 3, userId: 5, startTime };

  beforeEach(() => jest.clearAllMocks());

  it('announces a fresh start as RESOURCE_USAGE_SESSION_STARTED', () => {
    emitPluginSessionStart(pluginEvents, logger, {
      newSession,
      replacedSession: null,
      transitionTime,
      supervisorUserId: 9,
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, {
      resourceId: 3,
      usageId: 20,
      userId: 7,
      startTime: transitionTime,
      supervisorUserId: 9,
    });
  });

  it('announces a takeover for the new user and ends the replaced session', () => {
    emitPluginSessionStart(pluginEvents, logger, {
      newSession,
      replacedSession: oldSession,
      transitionTime,
      supervisorUserId: null,
    });

    expect(emit).toHaveBeenNthCalledWith(1, SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, {
      resourceId: 3,
      usageId: 20,
      userId: 7,
      startTime: transitionTime,
      previousUsageId: 10,
      previousUserId: 5,
    });
    expect(emit).toHaveBeenNthCalledWith(2, SystemEvent.RESOURCE_USAGE_SESSION_ENDED, {
      resourceId: 3,
      usageId: 10,
      userId: 5,
      startTime,
      endTime: transitionTime,
      reason: 'taken_over',
    });
    expect(emit).not.toHaveBeenCalledWith(SystemEvent.RESOURCE_USAGE_SESSION_STARTED, expect.anything());
  });

  it('announces an explicit end', () => {
    emitPluginSessionEnded(pluginEvents, logger, oldSession, transitionTime, 'ended');
    expect(emit).toHaveBeenCalledWith(SystemEvent.RESOURCE_USAGE_SESSION_ENDED, {
      resourceId: 3,
      usageId: 10,
      userId: 5,
      startTime,
      endTime: transitionTime,
      reason: 'ended',
    });
  });

  it('never throws into the lifecycle when emitting fails', () => {
    emit.mockImplementation(() => {
      throw new Error('bus down');
    });
    expect(() => emitPluginSessionEnded(pluginEvents, logger, oldSession, null, 'ended')).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('RESOURCE_USAGE_SESSION_ENDED'), expect.any(String));
  });
});
