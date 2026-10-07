export type SmtpSettingsFormVariant = 'standalone' | 'wizard';

export type SmtpSettingsFormProps = {
  variant: SmtpSettingsFormVariant;
  onNext?: () => void;
  endpoint: 'first-time-setup' | 'settings';
};
