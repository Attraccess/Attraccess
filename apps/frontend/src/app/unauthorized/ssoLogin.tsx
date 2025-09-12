import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Divider, Link } from '@heroui/react';
import de from './ssoLogin.de.json';
import en from './ssoLogin.en.json';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthenticationServiceGetAllSsoProviders, SSOProvider } from '@attraccess/react-query-client';
import { SSOLinkingRequiredModal } from './ssoLinkingRequiredModal';
import { useCallbackURL } from './use-sso-callback-url';

interface SSOLoginButtonProps {
  provider: SSOProvider;
}

function SSOLoginButton(props: Readonly<SSOLoginButtonProps>) {
  const { t } = useTranslations({
    de,
    en,
  });
  const { provider } = props;

  const loginHref = useCallbackURL(provider.id, provider.type);

  return (
    <Button as={Link} href={loginHref} isExternal fullWidth data-cy={`sso-login-button-${provider.name}`}>
      {t('loginWith', { provider: provider.name })}
    </Button>
  );
}

export function SSOLogin() {
  const { isLoading, data: providers } = useAuthenticationServiceGetAllSsoProviders();
  const location = useLocation();

  const query = useMemo(() => {
    return new URLSearchParams(location.search);
  }, [location]);

  const ssoLinkingIsRequired = useMemo(() => {
    return query.get('accountLinking') === 'required';
  }, [query]);

  if (providers?.length === 0 || isLoading) {
    return null;
  }

  if ((providers ?? []).length === 0) {
    return null;
  }

  return (
    <>
      <Divider />
      <SSOLinkingRequiredModal show={ssoLinkingIsRequired} />
      {providers?.map((provider) => (
        <SSOLoginButton key={provider.id} provider={provider} />
      ))}
    </>
  );
}
