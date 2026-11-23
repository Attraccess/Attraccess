import { ForbiddenException } from '@nestjs/common';
import { NETWORK_RESTRICTED_ERROR_CODE, NetworkRestrictedAction } from '@attraccess/application-models';
import { createTranslator } from '../i18n/translate';

const translate = createTranslator({
  en: { restricted: 'This action is only available from the local network.' },
  de: { restricted: 'Diese Aktion ist nur aus dem lokalen Netzwerk verfügbar.' },
});

/**
 * 403 for an action the caller's network does not allow. `message` is the stable machine-readable code (the
 * frontend translates it); `description` is the same sentence in the caller's language for API and MCP clients.
 */
export class NetworkRestrictedException extends ForbiddenException {
  constructor(action: NetworkRestrictedAction, locale?: string | null) {
    super({
      statusCode: 403,
      error: 'Forbidden',
      message: NETWORK_RESTRICTED_ERROR_CODE,
      code: NETWORK_RESTRICTED_ERROR_CODE,
      action,
      description: translate(locale, 'restricted'),
    });
  }
}
