import { Logger } from '@nestjs/common';

/**
 * Live pushes are best effort. A push that nobody awaits must not end as an unhandled rejection: Node ends the process
 * on one, and with PostgreSQL the lookup behind a push can fail for reasons outside the request (the connection to the
 * database dropped, the pool closed while the application shuts down). A failure is logged and otherwise ignored.
 */
export function bestEffortPush(push: Promise<unknown> | void, logger: Logger, what: string): void {
  void Promise.resolve(push).catch((error) =>
    logger.warn(`Failed to publish ${what}: ${error instanceof Error ? error.message : String(error)}`),
  );
}
