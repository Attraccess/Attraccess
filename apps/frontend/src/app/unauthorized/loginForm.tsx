import { LogInIcon } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionHeading,
  AccordionTrigger,
  AccordionPanel,
  AccordionBody,
  Skeleton,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useUsersServiceIsLocalSignupEnabled } from '@attraccess/react-query-client';
import { LoginFormHeader } from './LoginFormHeader';
import { LoginFormContent } from './LoginFormContent';
import en from './loginForm.en.json';
import de from './loginForm.de.json';

export interface LoginFormProps {
  onNeedsAccount: (() => void) | null;
  onForgotPassword: () => void;
}

export function LoginForm(props: LoginFormProps) {
  const { data: isLocalSignupEnabled, isLoading } = useUsersServiceIsLocalSignupEnabled();

  const { t } = useTranslations({ en, de });

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  if (isLocalSignupEnabled?.value) {
    return (
      <>
        <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled.value} />
        <LoginFormContent {...props} />
      </>
    );
  }

  return (
    <>
      <LoginFormHeader {...props} isLocalSignupEnabled={isLocalSignupEnabled?.value ?? false} />
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
              <LoginFormContent {...props} />
            </AccordionBody>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
}
