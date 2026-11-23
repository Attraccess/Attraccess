import { ApiError } from '@attraccess/react-query-client';
import { getApiErrorMessage } from '../../../utils/apiError';

/** Why a picked photo was not added. `rejected` carries the server's reason (a 400). */
export type ImageUploadProblem =
  | { kind: 'max' }
  | { kind: 'type' }
  | { kind: 'size' }
  | { kind: 'rateLimited' }
  | { kind: 'rejected'; message: string }
  | { kind: 'upload' };

/** Thrown while preparing a file, before anything is sent. */
export class ImageUploadProblemError extends Error {
  constructor(readonly problem: ImageUploadProblem) {
    super(problem.kind);
  }
}

/** The problem a failed upload stands for. */
export function imageUploadProblemFor(error: unknown): ImageUploadProblem {
  if (error instanceof ImageUploadProblemError) return error.problem;
  if (error instanceof ApiError && error.status === 429) return { kind: 'rateLimited' };
  if (error instanceof ApiError && error.status === 400) {
    const message = getApiErrorMessage(error);
    if (message && message !== error.message) return { kind: 'rejected', message };
  }
  return { kind: 'upload' };
}
