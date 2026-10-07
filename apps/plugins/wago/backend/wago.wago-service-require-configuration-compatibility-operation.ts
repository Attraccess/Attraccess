import { ConflictException } from '@nestjs/common';
import { compatibilityError } from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoServiceReviewDraftWhileLockedOperation } from './wago.wago-service-review-draft-while-locked-operation';


export abstract class WagoServiceRequireConfigurationCompatibilityOperation extends WagoServiceReviewDraftWhileLockedOperation {
  protected requireConfigurationCompatibility(controller: WagoController): void {
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
  }
}
