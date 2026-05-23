import { ApiError } from '@attraccess/react-query-client';
import { PolicyError } from '@attraccess/shared';

export function extractPolicyErrors(error: unknown): PolicyError[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }
  const body = error.body as { policyErrors?: PolicyError[] } | undefined;
  return Array.isArray(body?.policyErrors) ? body.policyErrors : null;
}
