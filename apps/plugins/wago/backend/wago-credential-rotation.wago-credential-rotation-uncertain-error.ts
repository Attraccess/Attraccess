import { ConflictException } from '@nestjs/common';


export class WagoCredentialRotationUncertainError extends ConflictException {
  constructor() {
    super('Credential rotation is incomplete. Inspect its recovery state and retry the pending handoff.');
  }
}
