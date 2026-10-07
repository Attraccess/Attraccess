import { Controller, Inject } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoCredentialRotationService } from './wago-credential-rotation';
import { WagoControllerApiPreviewRevisionOperation } from './wago.wago-controller-api-preview-revision-operation';

@Auth('resources.update')
@Controller('wago')
export class WagoControllerApi extends WagoControllerApiPreviewRevisionOperation {
  constructor(
    @Inject(WagoService) wago: WagoService,
    @Inject(WagoCommissioningService) commissioning: WagoCommissioningService,
    @Inject(WagoCredentialRotationService) credentialRotation: WagoCredentialRotationService,
    @Inject(Symbol.for('attraccess.plugin.context')) context?: PluginContext,
  ) {
    super(wago, commissioning, credentialRotation, context);
  }
}
