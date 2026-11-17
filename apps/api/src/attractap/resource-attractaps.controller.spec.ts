import { ResourceAttractapsController } from './resource-attractaps.controller';
import { AttractapService } from './attractap.service';
import { makeReader } from './attractap-fake-stores.test-fixture';
import { toReaderDto } from './dtos/reader.dto';

describe('ResourceAttractapsController', () => {
  const readers = [makeReader({ id: 3, name: 'Entrance' })];
  let attractapService: { getPairedReaders: jest.Mock };
  let controller: ResourceAttractapsController;

  beforeEach(() => {
    attractapService = { getPairedReaders: jest.fn().mockResolvedValue(readers) };
    controller = new ResourceAttractapsController(attractapService as unknown as AttractapService);
  });

  it('lists the readers linked to a resource', async () => {
    await expect(controller.getResourceAttractaps(5)).resolves.toEqual(readers.map(toReaderDto));
    expect(attractapService.getPairedReaders).toHaveBeenCalledWith({ resourceId: 5 });
  });

  it('does not expose the token hash of a reader', async () => {
    const [reader] = await controller.getResourceAttractaps(5);
    expect(Object.keys(reader)).not.toContain('apiTokenHash');
  });

  it('lists the readers linked to any resource of a group', async () => {
    await expect(controller.getResourceGroupAttractaps(2)).resolves.toEqual(readers.map(toReaderDto));
    expect(attractapService.getPairedReaders).toHaveBeenCalledWith({ resourceGroupId: 2 });
  });
});
