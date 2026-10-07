import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { ResourceFlowsExecutorServiceHandleCompanionForegroundAppOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-companion-foreground-app-operation';
export abstract class ResourceFlowsExecutorServiceHandleCompanionUsbConnectedOperation extends ResourceFlowsExecutorServiceHandleCompanionForegroundAppOperation {
  @OnEvent('companion.usb_connected')
  async handleCompanionUsbConnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggers.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED,
      event.payload,
    );
  }
}
