import { z } from 'zod';
import {
  AcknowledgementTimeoutSecondsSchema,
  CompletionBehaviorSchema,
  ExternalEffectPolicySchema,
} from './external-effect-policy';

export const HttpRequestNodeDataSchema = z
  .object({
    url: z.string().url('Invalid URL format'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    headers: z.record(z.string(), z.string()).optional().default({}),
    body: z.string().optional().default('').meta({
      stringVariant: 'multiline',
    }),
    timeoutSeconds: AcknowledgementTimeoutSecondsSchema,
    completionBehavior: CompletionBehaviorSchema.meta({
      helpText: 'Dispatch continues after the HTTP request is initiated. Acknowledged waits for the HTTP response.',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape);
