import { isValidEmail } from '../../utils/email';
import { LogInIcon } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Input,
  Label,
  Skeleton,
  TextField,
} from '@heroui/react';
import { Button } from '../../components/button';
import { OneTimeCodeInput } from '../../components/OneTimeCodeInput';
import { Alert } from '@heroui/react';
import { TExists, TFunction, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../../components/PasswordInput';
import en from './loginForm.en.json';
import de from './loginForm.de.json';
import { useUsersServiceIsLocalSignupEnabled } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { LoginFormProps } from './loginForm.login-form-props';
import { LoginFormHeader } from './loginForm.login-form-header';
import { useLoginFormContentState } from './useLoginFormContentState';

export function LoginForm(props: LoginFormProps) {
  const { data: isLocalSignupEnabled, isLoading } = useUsersServiceIsLocalSignupEnabled();

  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  if (isLocalSignupEnabled?.value) {
    return (
      <>
        <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled.value} t={t} />
        <LoginFormContent {...props} t={t} tExists={tExists} />
      </>
    );
  }

  return (
    <>
      <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled?.value ?? false} t={t} />
      <Accordion variant="default" className="w-full">
        <AccordionItem className="bg-default-100">
          <AccordionHeading>
            <AccordionTrigger>
              <LogInIcon className="mr-2" />
              {t('accordion.title')}
            </AccordionTrigger>
          </AccordionHeading>
          <AccordionPanel>
            <AccordionBody>
              <LoginFormContent {...props} t={t} tExists={tExists} />
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function LoginFormContent(props: LoginFormProps & { t: TFunction; tExists: TExists }) {
  const model = useLoginFormContentState(props);

  return (
    <form className="space-y-6" onSubmit={model.handleSubmit} data-cy="login-form">
      <TextField isDisabled={model.isPending}>
        <Label>{model.t('username')}</Label>
        <Input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          data-cy="login-form-username-input"
        />
      </TextField>
      <PasswordInput
        id="password"
        name="password"
        label={model.t('password')}
        required
        isDisabled={model.isPending}
        data-cy="login-form-password-input"
        autoComplete="current-password"
      />
      {/* Value sourced purely from React state (twoFactorCode), not FormData. */}
      <OneTimeCodeInput
        label={model.t('twoFactorCode')}
        description={model.t('twoFactorHelper')}
        value={model.twoFactorCode}
        onChange={model.setTwoFactorCode}
        isDisabled={model.isPending}
        data-cy="login-form-two-factor-input"
      />
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onPress={model.onForgotPassword}
          isDisabled={model.isPending}
          data-cy="login-form-forgot-password-button"
        >
          {model.t('forgotPassword')}
        </Button>
      </div>
      <Button
        variant="primary"
        type="submit"
        className="w-full"
        isPending={model.isPending}
        isDisabled={model.isPending}
        data-cy="login-form-sign-in-button"
      >
        {model.isPending ? model.t('signingIn') : model.t('signInButton')}
        {model.arrowRight}
      </Button>

      {model.errorTitle && (
        <Alert status="danger" data-cy="login-form-error-alert">
          <AlertContent>
            <AlertTitle>{model.errorTitle}</AlertTitle>
            <AlertDescription>{model.errorDescription}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {model.isEmailNotVerified && !model.resendSuccess && (
        <div className="space-y-2" data-testid="resend-verification-section">
          <p className="text-sm text-gray-600 dark:text-gray-400">{model.t('resendVerification.prompt')}</p>
          <TextField
            value={model.resendEmail}
            onChange={(value) => {
              model.setResendEmail(value);
              model.setResendError(null);
            }}
          >
            <Label>{model.t('resendVerification.emailLabel')}</Label>
            <Input type="email" data-testid="resend-email-input" />
          </TextField>
          {model.resendError && (
            <Alert status="danger" data-testid="resend-error-alert">
              <AlertContent>
                <AlertTitle>{model.resendError.title}</AlertTitle>
                <AlertDescription>{model.resendError.description}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onPress={() => {
              const trimmed = model.resendEmail.trim();
              if (!isValidEmail(trimmed)) {
                return;
              }
              model.resendVerification.mutate({ requestBody: { email: trimmed } });
            }}
            isPending={model.resendVerification.isPending}
            isDisabled={!isValidEmail(model.resendEmail.trim()) || model.resendVerification.isPending}
            data-testid="resend-verification-button"
          >
            {model.t('resendVerification.button')}
          </Button>
        </div>
      )}

      {model.resendSuccess && (
        <Alert status="success" data-testid="resend-success-alert">
          <AlertContent>
            <AlertTitle>{model.t('resendVerification.successTitle')}</AlertTitle>
            <AlertDescription>{model.t('resendVerification.successMessage')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </form>
  );
}
