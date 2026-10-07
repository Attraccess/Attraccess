import { Inject } from '@nestjs/common';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoAudit } from './wago-audit';
import { WagoCredentialRotationService } from './wago-credential-rotation';
import { WagoControllerApiListContract } from './wago.wago-controller-api-list-contract';


export abstract class WagoControllerApiState extends WagoControllerApiListContract {
  protected readonly audit: WagoAudit;

  constructor(
    @Inject(WagoService) protected readonly wago: WagoService,
    @Inject(WagoCommissioningService) protected readonly commissioning: WagoCommissioningService,
    @Inject(WagoCredentialRotationService) protected readonly credentialRotation: WagoCredentialRotationService,
    @Inject(Symbol.for('attraccess.plugin.context')) context?: PluginContext,
  ) {
    super();
    this.audit = new WagoAudit(context as PluginContext);
  }
}
