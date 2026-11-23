import { makeReader } from './attractap-fake-stores.test-fixture';
import { toReaderDto } from './dtos/reader.dto';
import { CardAccessService } from './card-access.service';
import { AttractapController } from './attractap.controller';
import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { WebsocketService } from './websockets/websocket.service';
import type { ResourceListVisibilityService } from '../resources/visibility/resource-list-visibility.service';

describe('AttractapController', () => {
  // Instantiated directly: routing this through the Nest testing module would drag in the auth and
  // license guards, none of which this test is about.
  const attractapService = {
    getPairedReaders: jest.fn().mockResolvedValue([]),
    getReadersToPair: jest.fn().mockResolvedValue([]),
    findReaderById: jest.fn(),
    updateReader: jest.fn(),
    getCrashReportsForReader: jest.fn().mockResolvedValue([]),
    getCrashReportCoredump: jest.fn(),
    deleteReader: jest.fn(),
    recordReaderDeregistration: jest.fn().mockResolvedValue(undefined),
  };
  // Managers see every reader unchanged; `narrowTo` switches to the permitted view with the given visible ids.
  const listVisibility = {
    scopeOf: jest.fn(async () => 'all'),
    filterVisible: jest.fn(async (_user: unknown, ids: number[]) => ids),
  };
  const narrowTo = (visible: number[]) => {
    listVisibility.scopeOf.mockResolvedValue('permitted');
    listVisibility.filterVisible.mockImplementation(async (_user, ids) => ids.filter((id) => visible.includes(id)));
  };
  const req = { user: { id: 3 } } as never;
  const controller = new AttractapController(
    {} as AttractapGateway,
    {} as WebsocketService,
    attractapService as unknown as AttractapService,
    {} as CardAccessService,
    listVisibility as unknown as ResourceListVisibilityService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    listVisibility.scopeOf.mockResolvedValue('all');
    listVisibility.filterVisible.mockImplementation(async (_user, ids) => ids);
  });

  // ATT-816: the supervised-start popup groups readers by the resource they are attached to. The
  // relation is not eager, so omitting it here makes every reader look unattached in the response.
  it('loads the resources relation when listing readers', async () => {
    await controller.getReaders(req);

    expect(attractapService.getPairedReaders).toHaveBeenCalledWith(expect.objectContaining({ withResources: true }));
  });

  // Readers whose pairing was removed exist for the pairing session only.
  it('lists only paired readers; the revoked ones come from the pairing session list', async () => {
    const paired = [makeReader({ id: 1, pairingState: 'paired' })];
    const revoked = [makeReader({ id: 2, pairingState: 'revoked' })];
    attractapService.getPairedReaders.mockResolvedValueOnce(paired);
    attractapService.getReadersToPair.mockResolvedValueOnce(revoked);

    await expect(controller.getReaders(req)).resolves.toEqual(paired.map(toReaderDto));
    await expect(controller.getReadersToPair()).resolves.toEqual(revoked.map(toReaderDto));
  });

  it.each(['revoked'])('does not show a %s reader by id', async (pairingState) => {
    attractapService.findReaderById.mockResolvedValueOnce({ id: 4, pairingState });
    await expect(controller.getReaderById(4, req)).rejects.toThrow('not found');
  });

  it('shows a paired reader by id', async () => {
    const reader = makeReader({ id: 4, pairingState: 'paired' });
    attractapService.findReaderById.mockResolvedValueOnce(reader);
    await expect(controller.getReaderById(4, req)).resolves.toEqual(toReaderDto(reader));
  });

  // No reader response carries the credential or certificate internals, however the reader was loaded.
  it('never puts the credential internals into a reader response', async () => {
    const reader = makeReader({ id: 4, resources: [] });
    attractapService.findReaderById.mockResolvedValueOnce(reader);
    const byId = await controller.getReaderById(4, req);
    expect(Object.keys(byId)).not.toContain('apiTokenHash');
  });

  it('leaves the resources out of a reader that was read without them, as before', async () => {
    attractapService.getPairedReaders.mockResolvedValueOnce([makeReader({ id: 4 })]);
    expect(Object.keys((await controller.getReaders(req))[0])).not.toContain('resources');
  });

  // A rename or a resource assignment through the API would make a reader that is not paired appear in
  // the resource's reader list.
  it.each(['revoked'])('does not update a %s reader', async (pairingState) => {
    attractapService.findReaderById.mockResolvedValueOnce({ id: 4, pairingState });
    await expect(controller.updateReader(4, { name: 'x', connectedResourceIds: [1] })).rejects.toThrow('not found');
    expect(attractapService.updateReader).not.toHaveBeenCalled();
  });

  it('does not update a reader that does not exist', async () => {
    attractapService.findReaderById.mockResolvedValueOnce(null);
    await expect(controller.updateReader(4, { name: 'x', connectedResourceIds: [1] })).rejects.toThrow('not found');
  });

  it('updates a paired reader', async () => {
    const reader = makeReader({ id: 4, pairingState: 'paired' });
    attractapService.findReaderById.mockResolvedValueOnce(reader);
    attractapService.updateReader.mockResolvedValueOnce(reader);
    await expect(controller.updateReader(4, { name: 'x', connectedResourceIds: [1] })).resolves.toEqual({
      message: 'Reader updated successfully',
      reader: toReaderDto(reader),
    });
  });

  it.each(['revoked'])('has no diagnostics for a %s reader', async (pairingState) => {
    attractapService.findReaderById.mockResolvedValue({ id: 4, pairingState });
    await expect(controller.getReaderCrashReports(4)).rejects.toThrow('not found');
    await expect(controller.getReaderCrashReportCoredump(4, 1)).rejects.toThrow('not found');
    expect(attractapService.getCrashReportsForReader).not.toHaveBeenCalled();
    expect(attractapService.getCrashReportCoredump).not.toHaveBeenCalled();
  });

  it('shows the crash reports of a paired reader', async () => {
    attractapService.findReaderById.mockResolvedValue({ id: 4, pairingState: 'paired' });
    attractapService.getCrashReportsForReader.mockResolvedValueOnce([{ id: 1 }]);
    await expect(controller.getReaderCrashReports(4)).resolves.toEqual([{ id: 1 }]);
  });

  it('records a deleted reader with the API-token principal', async () => {
    attractapService.deleteReader.mockResolvedValueOnce(true);
    const request = { user: { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 } } as never;

    await controller.deleteReader(3, request);

    expect(attractapService.recordReaderDeregistration).toHaveBeenCalledWith(3, {
      userId: 7,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('does not record a deregistration when no reader was deleted', async () => {
    attractapService.deleteReader.mockResolvedValueOnce(false);

    await controller.deleteReader(3, { user: { id: 7 } } as never);

    expect(attractapService.recordReaderDeregistration).not.toHaveBeenCalled();
  });

  describe('machine list visibility (ATT-843)', () => {
    const linked = (id: number) => ({ id, name: `M${id}`, type: 'machine', separateUnlockAndUnlatch: null }) as never;

    it('shows a narrowed viewer only visible machines, but keeps every reader for card enrollment', async () => {
      narrowTo([1]);
      const readers = [
        makeReader({ id: 1, resources: [linked(1), linked(2)] }),
        makeReader({ id: 2, resources: [linked(2)] }),
        makeReader({ id: 3, resources: [] }),
      ];
      attractapService.getPairedReaders.mockResolvedValueOnce(readers);

      const result = await controller.getReaders(req);

      expect(result.map((reader) => reader.id)).toEqual([1, 2, 3]);
      expect(result.map((reader) => reader.resources?.map((resource) => resource.id))).toEqual([[1], [], []]);
    });

    it('shows a reader by id without its hidden machines', async () => {
      narrowTo([]);
      attractapService.findReaderById.mockResolvedValueOnce(makeReader({ id: 4, resources: [linked(2)] }));
      await expect(controller.getReaderById(4, req)).resolves.toMatchObject({ id: 4, resources: [] });
    });

    it('leaves the readers of a viewer who sees every machine alone', async () => {
      const readers = [makeReader({ id: 2, resources: [linked(2)] }), makeReader({ id: 3, resources: [] })];
      attractapService.getPairedReaders.mockResolvedValueOnce(readers);
      await expect(controller.getReaders(req)).resolves.toEqual(readers.map(toReaderDto));
      expect(listVisibility.filterVisible).not.toHaveBeenCalled();
    });
  });
});
