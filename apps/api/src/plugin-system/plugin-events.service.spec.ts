import { EventEmitter2 } from '@nestjs/event-emitter';
import { Resource, User } from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { PluginEventsService } from './plugin-events.service';

function buildPayload(): { resource: Resource; user: User } {
  return { resource: { id: 1, name: 'CNC' } as Resource, user: { id: 7 } as User };
}

describe('PluginEventsService', () => {
  let events: EventEmitter2;
  let service: PluginEventsService;

  beforeEach(() => {
    events = new EventEmitter2();
    service = new PluginEventsService(events);
  });

  it('delivers a typed payload from emit to a subscribed handler', () => {
    const handler = jest.fn();
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, handler);

    const payload = buildPayload();
    service.emit(SystemEvent.RESOURCE_USAGE_STARTED, payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('namespaces events so distinct SystemEvents do not cross-fire', () => {
    const started = jest.fn();
    const ended = jest.fn();
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, started);
    service.onEvent(SystemEvent.RESOURCE_USAGE_ENDED, ended);

    service.emit(SystemEvent.RESOURCE_USAGE_ENDED, buildPayload());

    expect(ended).toHaveBeenCalledTimes(1);
    expect(started).not.toHaveBeenCalled();
  });

  it('detaches a handler when off() is called', () => {
    const handler = jest.fn();
    const subscription = service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, handler);
    subscription.off();

    service.emit(SystemEvent.RESOURCE_USAGE_STARTED, buildPayload());

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler so emit never throws into the core flow', () => {
    jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    service.onEvent(SystemEvent.RESOURCE_USAGE_STARTED, () => {
      throw new Error('plugin blew up');
    });

    expect(() => service.emit(SystemEvent.RESOURCE_USAGE_STARTED, buildPayload())).not.toThrow();
  });
});
