import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceFlowsExecutorServiceHandleCompanionUsbDisconnectedOperation } from './resource-flows-executor.service.resource-flows-executor-service-handle-companion-usb-disconnected-operation';
export abstract class ResourceFlowsExecutorServicePressButtonOperation extends ResourceFlowsExecutorServiceHandleCompanionUsbDisconnectedOperation {
  public async pressButton(resourceId: number, buttonId: string, executingUserId: number) {
    const activeResourceUsage = await this.resourceUsageService.getActiveSession(resourceId);

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
