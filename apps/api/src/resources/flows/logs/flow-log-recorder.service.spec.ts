import { FlowLogRecorderService } from './flow-log-recorder.service';
import { ResourceFlowLogType } from '../dto/flow-log.dto';

describe('FlowLogRecorderService', () => {
  let service: FlowLogRecorderService;

  const entry = (resourceId = 1) => ({
    flowRunId: 'run-1',
    nodeId: 'node-1',
    resourceId,
    type: ResourceFlowLogType.NODE_PROCESSING_STARTED,
    payload: () => ({ input: { hello: 'world' } }),
  });

  beforeEach(() => {
    service = new FlowLogRecorderService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('drops logs while no recording is active, without serializing the payload', () => {
    const payload = jest.fn(() => ({ big: 'object' }));

    service.record({ ...entry(), payload });

    expect(payload).not.toHaveBeenCalled();
    expect(service.getLogs(1).logs).toHaveLength(0);
    expect(service.getLogs(1).recording.isRecording).toBe(false);
  });

  it('keepAlive starts a 15 minute recording when none is active', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const status = service.keepAlive(1);
    service.record(entry());

    expect(status.isRecording).toBe(true);
    expect(status.startedAt.getTime()).toBe(now);
    expect(status.expiresAt.getTime()).toBe(now + 15 * 60_000);
    expect(service.getLogs(1).logs).toHaveLength(1);
    expect(JSON.parse(service.getLogs(1).logs[0].payload)).toEqual({ input: { hello: 'world' } });
  });

  it('only records for the resource being recorded', () => {
    service.keepAlive(1);

    service.record(entry(2));

    expect(service.getLogs(2).logs).toHaveLength(0);
  });

  it('keepAlive extends an active recording and keeps its start time and logs', () => {
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);
    service.keepAlive(1);
    service.record(entry());

    jest.spyOn(Date, 'now').mockReturnValue(start + 10 * 60_000);
    const status = service.keepAlive(1);

    expect(status.startedAt.getTime()).toBe(start);
    expect(status.expiresAt.getTime()).toBe(start + 25 * 60_000);
    expect(service.getLogs(1).logs).toHaveLength(1);
  });

  it('keepAlive never moves the expiry backwards', () => {
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);
    service.keepAlive(1);

    // A clock that went backwards must not shorten the recording.
    jest.spyOn(Date, 'now').mockReturnValue(start - 5 * 60_000);
    const status = service.keepAlive(1);

    expect(status.expiresAt.getTime()).toBe(start + 15 * 60_000);
  });

  it('keepAlive on an expired recording starts a new, empty one', () => {
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);
    service.keepAlive(1);
    service.record(entry());

    const later = start + 16 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    const status = service.keepAlive(1);

    expect(status.startedAt.getTime()).toBe(later);
    expect(status.expiresAt.getTime()).toBe(later + 15 * 60_000);
    expect(service.getLogs(1).logs).toHaveLength(0);
  });

  it('stops recording and discards logs once no renewal arrives for 15 minutes', () => {
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);
    service.keepAlive(1);
    service.record(entry());

    jest.spyOn(Date, 'now').mockReturnValue(start + 15 * 60_000);

    expect(service.isRecording(1)).toBe(false);
    expect(service.getLogs(1).logs).toHaveLength(0);
  });

  it('reading the status or the logs never starts a recording', () => {
    service.getStatus(1);
    service.getLogs(1);

    expect(service.isRecording(1)).toBe(false);
  });

  it('publishes recorded logs to the resource stream', () => {
    const received: unknown[] = [];
    service.subjectFor(1).subscribe((event) => received.push(event));
    service.keepAlive(1);

    service.record(entry());

    expect(received).toHaveLength(1);
  });
});
