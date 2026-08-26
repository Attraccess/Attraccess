export class ExternalEffectFailureError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = 'ExternalEffectFailureError';
  }
}
