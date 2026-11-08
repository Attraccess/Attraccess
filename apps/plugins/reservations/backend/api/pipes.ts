import { ValidationPipe, type Type } from '@nestjs/common';

/**
 * Validation pipe bound to an explicit DTO class. The plugin bundle carries no decorator type metadata
 * (esbuild), so the host's global ValidationPipe cannot infer the body class and would skip validation.
 */
export function validated<T>(dto: Type<T>): ValidationPipe {
  return new ValidationPipe({ expectedType: dto, whitelist: true, transform: true });
}
