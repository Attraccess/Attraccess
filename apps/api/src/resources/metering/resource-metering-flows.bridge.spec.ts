import { MODULE_METADATA } from '@nestjs/common/constants';
import { ResourceFlowsExecutorService } from '../flows/execution/resource-flows-executor.service';
import { ResourceMeteringModule } from './resource-metering.module';
import { ResourceMeteringFlowsBridge } from './resource-metering-flows.bridge';
import { ResourceMeteringService } from './resource-metering.service';

describe('ResourceMeteringFlowsBridge', () => {
  it('is provided by the metering module, so the app always builds it', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ResourceMeteringModule)).toContain(
      ResourceMeteringFlowsBridge,
    );
  });

  it('attaches the metering service to flows when constructed', () => {
    const flows = { attachMetering: jest.fn() } as unknown as ResourceFlowsExecutorService;
    const metering = {} as ResourceMeteringService;

    new ResourceMeteringFlowsBridge(flows, metering);

    expect(flows.attachMetering).toHaveBeenCalledWith(metering);
  });
});
