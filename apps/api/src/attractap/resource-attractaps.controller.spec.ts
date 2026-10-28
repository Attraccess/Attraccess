import { ResourceAttractapsController } from './resource-attractaps.controller';
import { AttractapService } from './attractap.service';

describe('ResourceAttractapsController', () => {
  const readers = [{ id: 3, name: 'Entrance' }];
  let attractapService: { getAllReaders: jest.Mock };
  let controller: ResourceAttractapsController;

  beforeEach(() => {
    attractapService = { getAllReaders: jest.fn().mockResolvedValue(readers) };
    controller = new ResourceAttractapsController(attractapService as unknown as AttractapService);
  });

  it('lists the readers linked to a resource', async () => {
    await expect(controller.getResourceAttractaps(5)).resolves.toBe(readers);
    expect(attractapService.getAllReaders).toHaveBeenCalledWith({ where: { resources: { id: 5 } } });
  });

  it('lists the readers linked to any resource of a group', async () => {
    await expect(controller.getResourceGroupAttractaps(2)).resolves.toBe(readers);
    expect(attractapService.getAllReaders).toHaveBeenCalledWith({ where: { resources: { groups: { id: 2 } } } });
  });
});
