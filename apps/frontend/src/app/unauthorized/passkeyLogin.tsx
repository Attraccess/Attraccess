import { useCallback, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { KeyRound } from 'lucide-react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  PasskeysService,
  UseUsersServiceGetCurrentKeyFn,
} from '@attraccess/react-query-client';
import { Button } from '../../components/button';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { getTranslationKeyForApiError } from '../../utils/apiError';
import en from './passkeyLogin.en.json';
import de from './passkeyLogin.de.json';

export function PasskeyLogin() {
  // `api.generic` is the fallback the helper picks when the server message has no translation,
  // so pointing it at the passkey copy keeps browser/unknown failures on the passkey wording
  // while a known error like UserEmailNotVerifiedException explains itself.
  const { t, tExists } = useTranslations({
    en: { ...en, api: { ...API_ERROR_TRANSLATIONS_EN, generic: en.error } },
    de: { ...de, api: { ...API_ERROR_TRANSLATIONS_DE, generic: de.error } },
  });
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<{ title: string; description: string } | null>(null);

  const signIn = useCallback(async () => {
    setIsPending(true);
    setError(null);

    try {
      const { options } = await PasskeysService.getPasskeyAuthenticationOptions();
      const response = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });

      await PasskeysService.createSessionWithPasskey({
        requestBody: { response: response as unknown as Record<string, unknown>, tokenLocation: 'cookie' },
      });

      await queryClient.invalidateQueries({ queryKey: UseUsersServiceGetCurrentKeyFn() });
    } catch (caught) {
      // The browser throws when the user dismisses the system prompt - that is not worth an alert
      if (caught instanceof Error && (caught.name === 'NotAllowedError' || caught.name === 'AbortError')) {
        return;
      }
      const { key } = getTranslationKeyForApiError({
        error: caught as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
      setError({ title: t(key + '.title'), description: t(key + '.description', { error: caught }) });
    } finally {
      setIsPending(false);
    }
  }, [queryClient, t, tExists]);

  if (!browserSupportsWebAuthn()) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        className="w-full"
        onPress={signIn}
        isPending={isPending}
        isDisabled={isPending}
        data-cy="passkey-login-button"
      >
        <KeyRound />
        {isPending ? t('signingIn') : t('signInButton')}
      </Button>

      {error && (
        <Alert status="danger" data-cy="passkey-login-error-alert">
          <AlertContent>
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.description}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}
