import { Logger } from '@nestjs/common';
import { BillingService } from './billing.service';
import { SumUpService } from './sumup.service';

export abstract class BillingControllerRouteContext {
  protected abstract readonly billingService: BillingService;
  protected abstract readonly sumUpService: SumUpService;
  protected abstract readonly logger: Logger;
}
