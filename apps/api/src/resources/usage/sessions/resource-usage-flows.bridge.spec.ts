import { MODULE_METADATA } from '@nestjs/common/constants';
import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';
import { ResourceUsageModule } from '../resourceUsage.module';
import { ResourceUsageFlowsBridge } from './resource-usage-flows.bridge';
import { ResourceUsageService } from './resource-usage.service';

describe('ResourceUsageFlowsBridge', () => {
  it('is provided by the usage module, so the app always builds it', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ResourceUsageModule)).toContain(ResourceUsageFlowsBridge);
  });

  it('attaches the usage service to flows when constructed', () => {
    const flows = { attachUsage: jest.fn() } as unknown as ResourceFlowsExecutorService;
    const usage = {} as ResourceUsageService;

    new ResourceUsageFlowsBridge(flows, usage);

    expect(flows.attachUsage).toHaveBeenCalledWith(usage);
  });
});
