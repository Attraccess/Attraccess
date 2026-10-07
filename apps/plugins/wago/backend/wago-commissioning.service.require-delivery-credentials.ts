import {
  ConflictException
} from '@nestjs/common';
import type { DeliveryInput } from "./wago-commissioning.service.delivery-input";
import type { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";

export function requireDeliveryCredentials(input: DeliveryInput): TemporarySshCredential {
  if (input?.confirmInstall !== true)
    throw new ConflictException('explicit installation confirmation is required for every delivery attempt');
  const credential = input.temporarySsh;
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    !credential.password.trim() ||
    /[\r\n\0]/.test(credential.password)
  )
    throw new ConflictException('explicit valid SSH username and password are required for every delivery attempt');
  return credential;
}
