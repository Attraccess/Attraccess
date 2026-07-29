import { useCallback, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { KeyRound } from 'lucide-react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  PasskeysService,
  UseUsersServiceGetCurrentKeyFn,
} from '@attraccess/react-query-client';
import { Button } from '../../components/button';
import en from './passkeyLogin.en.json';
import de from './passkeyLogin.de.json';

export function PasskeyLogin() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(t('error.description'));
    } finally {
      setIsPending(false);
    }
  }, [queryClient, t]);

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
            <AlertTitle>{t('error.title')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </div>
  );
}
