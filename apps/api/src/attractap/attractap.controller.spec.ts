import { AttractapController } from './attractap.controller';
import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { WebsocketService } from './websockets/websocket.service';

describe('AttractapController', () => {
  // Instantiated directly: routing this through the Nest testing module would drag in the auth and
  // license guards, none of which this test is about.
  const attractapService = {
    getAllReaders: jest.fn().mockResolvedValue([]),
    deleteReader: jest.fn(),
    recordReaderDeregistration: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new AttractapController(
    {} as AttractapGateway,
    {} as WebsocketService,
    attractapService as unknown as AttractapService,
  );

  beforeEach(() => jest.clearAllMocks());

  // ATT-816: the supervised-start popup groups readers by the resource they are attached to. The
  // relation is not eager, so omitting it here makes every reader look unattached in the response.
  it('loads the resources relation when listing readers', async () => {
    await controller.getReaders();

    expect(attractapService.getAllReaders).toHaveBeenCalledWith(expect.objectContaining({ relations: ['resources'] }));
  });

  it('records a deleted reader with the API-token principal', async () => {
    attractapService.deleteReader.mockResolvedValueOnce(true);
    const request = { user: { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 } } as never;

    await controller.deleteReader(3, request);

    expect(attractapService.recordReaderDeregistration).toHaveBeenCalledWith(3, {
      userId: 7, authenticationMethod: 'api-token', apiTokenId: 9,
    });
  });

  it('does not record a deregistration when no reader was deleted', async () => {
    attractapService.deleteReader.mockResolvedValueOnce(false);

    await controller.deleteReader(3, { user: { id: 7 } } as never);

    expect(attractapService.recordReaderDeregistration).not.toHaveBeenCalled();
  });
});
