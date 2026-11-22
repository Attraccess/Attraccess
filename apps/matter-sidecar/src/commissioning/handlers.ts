import type { FeatureHandlers } from '../request-pipeline';
import type { CommissioningService } from './service';

type StartBody = { setupCode: string; attestationOverride?: { confirmed: true } };

/** The `commissioning.start`, `.get` and `.cancel` operations. */
export function commissioningHandlers(service: CommissioningService): FeatureHandlers {
  return {
    'commissioning.start': ({ body }) => service.start(body as StartBody),
    'commissioning.get': ({ params }) => service.get((params as { sessionId: string }).sessionId),
    'commissioning.cancel': ({ params }) => service.cancel((params as { sessionId: string }).sessionId),
  };
}
