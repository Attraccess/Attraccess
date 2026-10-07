import {
  CompanionForegroundAppNodeDataSchema,
  CompanionIdleActiveNodeDataSchema,
  CompanionUsbDeviceNodeDataSchema,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CompanionUsbDeviceDto } from '../../companion/companion.types';
import { FlowResourceHealthImplementation } from './flow-resource-health';
import { compileFlowTemplate } from './flow-template';
export abstract class FlowCompanionInputImplementation extends FlowResourceHealthImplementation {
  protected compileTemplate(template: string, data: object): string {
    const variables = this.templateVariables.get(data);
    const dataWithVariables = variables ? { ...data, variables } : data;
    return compileFlowTemplate(template, dataWithVariables);
  }

  @OnEvent('companion.idle')
  async handleCompanionIdle(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_IDLE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.active')
  async handleCompanionActive(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_ACTIVE,
      event.payload,
      CompanionIdleActiveNodeDataSchema,
    );
  }

  @OnEvent('companion.foreground_app')
  async handleCompanionForegroundApp(event: { deviceId: number; payload: object }): Promise<void> {
    await this.triggerCompanionEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_FOREGROUND_APP_CHANGED,
      event.payload,
      CompanionForegroundAppNodeDataSchema,
    );
  }

  @OnEvent('companion.usb_connected')
  async handleCompanionUsbConnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_CONNECTED,
      event.payload,
    );
  }

  @OnEvent('companion.usb_disconnected')
  async handleCompanionUsbDisconnected(event: { deviceId: number; payload: CompanionUsbDeviceDto }): Promise<void> {
    await this.triggerUsbDeviceEvent(
      event.deviceId,
      ResourceFlowNodeType.INPUT_COMPANION_USB_DEVICE_DISCONNECTED,
      event.payload,
    );
  }

  protected async triggerCompanionEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: object,
    schema: { safeParse: (d: unknown) => { success: boolean; data?: { deviceId: number } } },
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = schema.safeParse(node.data ?? {});
      return parsed.success && parsed.data?.deviceId === deviceId;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }

  protected async triggerUsbDeviceEvent(
    deviceId: number,
    type: ResourceFlowNodeType,
    payload: CompanionUsbDeviceDto,
  ): Promise<void> {
    const allNodes = await this.flowNodeRepository.find({ where: { type } });
    const matching = allNodes.filter((node) => {
      const parsed = CompanionUsbDeviceNodeDataSchema.safeParse(node.data ?? {});
      if (!parsed.success || parsed.data.deviceId !== deviceId) return false;
      const { vendorId, productId } = parsed.data;
      const hasVendorFilter = vendorId !== undefined;
      const hasProductFilter = productId !== undefined;
      if (hasVendorFilter && hasProductFilter) {
        return vendorId === payload.vendorId && productId === payload.productId;
      }
      if (hasVendorFilter) return vendorId === payload.vendorId;
      if (hasProductFilter) return productId === payload.productId;
      return true;
    });
    if (matching.length === 0) return;
    await this.startFlow(matching, { payload });
  }

  public async pressButton(resourceId: number, buttonId: string, executingUserId: number) {
    const activeResourceUsage = await this.resourceUsageService.getActiveSession(resourceId, false);

    if (
      !executingUserId ||
      !activeResourceUsage ||
      !activeResourceUsage.userId ||
      activeResourceUsage.userId !== executingUserId
    ) {
      throw new ForbiddenException('You are not allowed to press this button');
    }

    const button = await this.flowNodeRepository.findOne({
      where: {
        resourceId,
        type: ResourceFlowNodeType.INPUT_BUTTON,
        id: buttonId.toString(),
      },
    });

    if (!button) {
      throw new NotFoundException('UNKNOWN_BUTTON_ID', { cause: { buttonId } });
    }

    await this.startFlow(button, { payload: {} });
  }
}
