import { Button, Input, Label, TextField } from '@heroui/react';
import { useWagoTranslations } from './i18n';

export function CredentialFields({
  intent = 'installation',
  managed = false,
  isDisabled,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  custom,
  onCustomChange,
}: {
  intent?: 'installation' | 'recovery';
  managed?: boolean;
  isDisabled: boolean;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  custom: boolean;
  onCustomChange: (value: boolean) => void;
}) {
  const { t } = useWagoTranslations();
  return (
    <div className="wg:space-y-3">
      <p className="wg:text-sm">
        {t('commissioningUI.sshLogin', {
          account: t(
            custom
              ? 'commissioningUI.custom'
              : managed
                ? 'commissioningUI.managedAccount'
                : 'commissioningUI.defaultAccount',
          ),
        })}
      </p>
      <Button variant="tertiary" size="sm" isDisabled={isDisabled} onPress={() => onCustomChange(!custom)}>
        {t(custom ? 'commissioningUI.useDefaultLogin' : 'commissioningUI.advanced')}
      </Button>
      {custom && (
        <div className="wg:grid wg:gap-4 wg:sm:grid-cols-2">
          <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-username`}>
            <Label>{t(`commissioningUI.${intent}Username`)}</Label>
            <Input autoComplete="off" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
          </TextField>
          <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-password`}>
            <Label>{t(`commissioningUI.${intent}Password`)}</Label>
            <Input
              autoComplete="off"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </TextField>
        </div>
      )}
    </div>
  );
}
