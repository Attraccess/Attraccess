import { AttractapController } from './attractap.controller';
import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { WebsocketService } from './websockets/websocket.service';

describe('AttractapController', () => {
  // Instantiated directly: routing this through the Nest testing module would drag in the auth and
  // license guards, none of which this test is about.
  const attractapService = { getAllReaders: jest.fn().mockResolvedValue([]) };
  const controller = new AttractapController(
    {} as AttractapGateway,
    {} as WebsocketService,
    attractapService as unknown as AttractapService,
  );

  // ATT-816: the supervised-start popup groups readers by the resource they are attached to. The
  // relation is not eager, so omitting it here makes every reader look unattached in the response.
  it('loads the resources relation when listing readers', async () => {
    await controller.getReaders();

    expect(attractapService.getAllReaders).toHaveBeenCalledWith(expect.objectContaining({ relations: ['resources'] }));
  });
});
