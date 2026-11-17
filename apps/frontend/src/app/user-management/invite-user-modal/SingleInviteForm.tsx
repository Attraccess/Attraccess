import type { RefObject } from 'react';
import { Form, Input, Label, TextField } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  UsernameInput,
  USERNAME_RULES,
  type UsernameValidationMessages,
} from '../../../components/UsernameInput/index';
import en from './en.json';
import de from './de.json';

interface SingleInviteFormProps {
  formRef: RefObject<HTMLFormElement | null>;
  username: string;
  onUsernameChange: (username: string) => void;
  email: string;
  onEmailChange: (email: string) => void;
  usernameValidationMessages: UsernameValidationMessages;
  onSubmit: () => void;
}

/** Username and email fields of the single-user invite; the drawer footer submits it. */
export function SingleInviteForm(props: Readonly<SingleInviteFormProps>) {
  const { formRef, username, onUsernameChange, email, onEmailChange, usernameValidationMessages, onSubmit } = props;
  const { t } = useTranslations({ en, de });

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <UsernameInput
        label={t('inputs.username.label')}
        name="username"
        isRequired
        value={username}
        onChange={onUsernameChange}
        validationMessages={usernameValidationMessages}
        description={t('inputs.username.description', {
          min: USERNAME_RULES.minLength,
          max: USERNAME_RULES.maxLength,
        })}
      />
      <TextField isRequired value={email} onChange={onEmailChange}>
        <Label>{t('inputs.email.label')}</Label>
        <Input name="email" type="email" required />
      </TextField>
    </Form>
  );
}
