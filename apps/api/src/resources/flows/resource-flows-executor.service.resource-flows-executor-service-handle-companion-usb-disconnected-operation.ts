import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { OnEvent } from '@nestjs/event-emitter';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { ResourceFlowsExecutorServiceHandleCompanionUsbConnectedOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-companion-usb-connected-operation';
export abstract class ResourceFlowsExecutorServiceHandleCompanionUsbDisconnectedOperation extends ResourceFlowsExecutorServiceHandleCompanionUsbConnectedOperation {
  @OnEvent('companion.usb_disconnected')
  async handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggers.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED,
      event.payload,
    );
  }
}
