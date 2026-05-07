import { Test } from '@nestjs/testing';
import { ResourceFlowVariableScope } from '@attraccess/database-entities';
import { ResourceFlowVariablesController } from './resource-flow-variables.controller';
import { ResourceFlowVariablesService } from './resource-flow-variables.service';

describe('ResourceFlowVariablesController', () => {
  let controller: ResourceFlowVariablesController;
  let service: jest.Mocked<ResourceFlowVariablesService>;

  beforeEach(async () => {
    const now = new Date();
    service = {
      listForResource: jest.fn(async () => [
        {
          id: 1,
          scope: ResourceFlowVariableScope.RESOURCE,
          resourceId: 5,
          key: 'a',
          value: '"x"',
          valueType: 'string',
          createdAt: now,
          updatedAt: now,
          resource: null,
        } as never,
      ]),
      set: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ResourceFlowVariablesService>;

    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceFlowVariablesController],
      providers: [{ provide: ResourceFlowVariablesService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ResourceFlowVariablesController);
  });

  it('lists variables for resource', async () => {
    const result = await controller.list(5);
    expect(service.listForResource).toHaveBeenCalledWith(5);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ scope: ResourceFlowVariableScope.RESOURCE, key: 'a', value: 'x' });
  });

  it('upserts via PUT', async () => {
    await controller.upsert(5, ResourceFlowVariableScope.GLOBAL, 'k', { value: { foo: 1 } });
    expect(service.set).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, 5, 'k', { foo: 1 }, 5);
  });

  it('upsert resolves resource scope to its resource id', async () => {
    await controller.upsert(7, ResourceFlowVariableScope.RESOURCE, 'k', { value: 'v' });
    expect(service.set).toHaveBeenCalledWith(ResourceFlowVariableScope.RESOURCE, 7, 'k', 'v', 7);
  });

  it('deletes via DELETE', async () => {
    await controller.remove(5, ResourceFlowVariableScope.GLOBAL, 'k');
    expect(service.delete).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, 5, 'k');
  });
});
