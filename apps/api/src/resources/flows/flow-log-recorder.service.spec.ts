import { FlowLogRecorderService } from './flow-log-recorder.service';
import { ResourceFlowLogType } from './dto/flow-log.dto';

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
  });

  it('drops logs while no recording is active, without serializing the payload', () => {
    const payload = jest.fn(() => ({ big: 'object' }));

    service.record({ ...entry(), payload });

    expect(payload).not.toHaveBeenCalled();
    expect(service.getLogs(1).logs).toHaveLength(0);
    expect(service.getLogs(1).recording.isRecording).toBe(false);
  });

  it('collects logs while recording and reports the expiry', () => {
    const status = service.start(1, 15);

    service.record(entry());

    expect(status.isRecording).toBe(true);
    expect(status.startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(status.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(service.getLogs(1).logs).toHaveLength(1);
    expect(JSON.parse(service.getLogs(1).logs[0].payload)).toEqual({ input: { hello: 'world' } });
  });

  it('only records for the resource being recorded', () => {
    service.start(1);

    service.record(entry(2));

    expect(service.getLogs(2).logs).toHaveLength(0);
  });

  it('discards all logs when the recording is stopped', () => {
    service.start(1);
    service.record(entry());

    expect(service.stop(1).isRecording).toBe(false);
    expect(service.getLogs(1).logs).toHaveLength(0);
  });

  it('stops recording and discards logs once the duration elapses', () => {
    service.start(1, 15);
    service.record(entry());

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);

    expect(service.isRecording(1)).toBe(false);
    expect(service.getLogs(1).logs).toHaveLength(0);

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('clamps the duration to 24 hours', () => {
    const status = service.start(1, 60 * 48);

    expect(status.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60_000);
  });

  it('publishes recorded logs to the resource stream', () => {
    const received: unknown[] = [];
    service.subjectFor(1).subscribe((event) => received.push(event));
    service.start(1);

    service.record(entry());

    expect(received).toHaveLength(1);
  });
});
