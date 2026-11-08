import {
  Alert,
  AlertContent,
  AlertDescription,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from '@heroui/react';
import {
  AlertStatusIcon,
  Button,
  PasswordInput,
  StandardModal,
  useTranslations,
  useUrlQuery,
} from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import {
  ApiError,
  useAuthenticationServiceLinkUserToExternalAccount,
  SSOProviderType,
} from '@attraccess/react-query-client';

import de from './de.json';
import en from './en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import { getApiErrorMessage, getTranslationKeyForApiError } from '../../../utils/apiError';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useCallbackURL } from '../use-sso-callback-url';

interface Props {
  show: boolean;
}

// The server rejects these link tokens for good; only a fresh SSO sign-in issues a new one.
const DEAD_TOKEN_CODES = new Set([
  'LINK_TOKEN_USED',
  'LINK_TOKEN_EXHAUSTED',
  'LINK_TOKEN_EXPIRED',
  'INVALID_LINK_TOKEN',
]);

const LINK_ERROR_KEYS: Record<string, string | undefined> = {
  SSO_ALREADY_LINKED: 'errors.alreadyLinked',
  PASSWORD_REQUIRED: 'errors.passwordRequired',
  SSO_SUBJECT_ALREADY_LINKED: 'errors.subjectTaken',
};

export function SSOLinkingRequiredModal(props: Props) {
  const { show } = props;

  const { t, tExists } = useTranslations({
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
  });
  const toast = useToastMessage();

  const query = useUrlQuery();
  const { email, linkToken, tokenPayload } = useMemo(() => {
    const rawLinkToken = query.get('ssoLinkToken');
    let parsedPayload: {
      email?: string;
      providerId?: number;
      providerType?: SSOProviderType;
    } | null = null;

    if (rawLinkToken) {
      try {
        const [encodedPayload] = rawLinkToken.split('.');
        if (encodedPayload) {
          const padded = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
          parsedPayload = JSON.parse(decoded);
        }
      } catch {
        parsedPayload = null;
      }
    }

    return {
      email: query.get('email') ?? parsedPayload?.email ?? undefined,
      linkToken: rawLinkToken ?? undefined,
      tokenPayload: parsedPayload,
    };
  }, [query]);

  const [password, setPassword] = useState('');
  const [tokenDead, setTokenDead] = useState(false);
  // A double click fires before the pending state re-renders; the second request would burn a password attempt.
  const requestInFlight = useRef(false);

  const cleanHref = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('accountLinking');
    url.searchParams.delete('email');
    url.searchParams.delete('ssoLinkToken');
    url.searchParams.delete('ssoProviderType');

    return url.toString();
  }, []);

  const callbackURL = useCallbackURL(
    tokenPayload?.providerId ?? -1,
    (tokenPayload?.providerType as SSOProviderType) ?? SSOProviderType.OIDC,
    cleanHref,
  );
  const canRestartSso = typeof tokenPayload?.providerId === 'number';

  const { mutate: linkMutation, isPending: linkingIsLoading } = useAuthenticationServiceLinkUserToExternalAccount({
    onSettled: () => {
      requestInFlight.current = false;
    },
    onSuccess: () => {
      window.location.href = callbackURL;
    },
    onError: (err: unknown) => {
      const error = err as ApiError;
      const message = getApiErrorMessage(error);
      if (message === 'Unauthorized') {
        toast.error({ title: t('errors.invalidPassword') });
        return;
      }

      const linkErrorKey = LINK_ERROR_KEYS[message];
      if (linkErrorKey) {
        toast.error({ title: t(linkErrorKey) });
        return;
      }

      if (DEAD_TOKEN_CODES.has(message)) {
        setTokenDead(true);
      }

      const { key } = getTranslationKeyForApiError({
        error,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
      const retryAfterSeconds = Number((error.body as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds);
      toast.error({
        title: t(key + '.title'),
        description: t(key + '.description', {
          error: message,
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : '',
        }),
      });
    },
  });

  const linkUser = useCallback(() => {
    if (!linkToken || requestInFlight.current) {
      return;
    }
    requestInFlight.current = true;

    linkMutation({
      requestBody: {
        linkToken,
        password,
      },
    });
  }, [linkToken, linkMutation, password]);

  return (
    <StandardModal isOpen={show} size="md" backdropProps={{ isDismissable: false }}>
      {() => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
            <p className="text-sm text-muted">{t('subtitle')}</p>
          </ModalHeader>

          <ModalBody>
            <Alert status="warning">
              <AlertStatusIcon status="warning" />
              <AlertContent>
                <AlertDescription>{t('description', { email })}</AlertDescription>
              </AlertContent>
            </Alert>

            <PasswordInput
              label={t('inputs.password.label')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              isDisabled={tokenDead}
            />
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" onPress={() => window.location.replace(cleanHref)}>
              {t('actions.cancel')}
            </Button>
            {!tokenDead && (
              <Button variant="primary" onPress={linkUser} isPending={linkingIsLoading} isDisabled={!password}>
                {t('actions.link')}
              </Button>
            )}
            {tokenDead && canRestartSso && (
              <Button
                variant="primary"
                onPress={() => {
                  window.location.href = callbackURL;
                }}
              >
                {t('actions.restartSso')}
              </Button>
            )}
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
