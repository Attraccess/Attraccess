import { z } from 'zod';

export const ExternalEffectFailureBehaviorSchema = z
  .enum(['fail-flow', 'failure-output', 'log-and-continue'])
  .default('log-and-continue')
  .meta({
    helpText:
      'fail-flow aborts the triggering operation, failure-output routes the error through the failure handle, and log-and-continue records the error and continues normally.',
  });

export const ExternalEffectPolicySchema = z.object({
  failureBehavior: ExternalEffectFailureBehaviorSchema,
});

export type ExternalEffectFailureBehavior = z.infer<typeof ExternalEffectFailureBehaviorSchema>;

export const AcknowledgementTimeoutSecondsSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483, 'Timeout exceeds the supported timer limit')
  .optional()
  .meta({
    helpText: 'Maximum time to wait for an acknowledgement, in seconds. Leave empty to use the integration default.',
  });

export const CompletionBehaviorSchema = z.enum(['dispatch', 'acknowledged']).default('acknowledged');
