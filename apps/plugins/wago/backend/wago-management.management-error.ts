


export class ManagementError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'credentials_required'
      | 'busy'
      | 'inspect_required'
      | 'review_required'
      | 'qualification_required'
      | 'UNSUPPORTED'
      | 'recovery_required'
      | 'operation_failed',
  ) {
    super(code);
  }
}
