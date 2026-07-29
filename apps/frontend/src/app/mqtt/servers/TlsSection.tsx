import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  AlertTitle,
  Description,
  Input,
  Label,
  TextArea,
  TextField,
} from '@heroui/react';
import { AlertTriangleIcon } from 'lucide-react';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import type { CreateMqttServerDto } from '@attraccess/react-query-client';

interface TlsSectionProps {
  values: CreateMqttServerDto;
  onChange: (patch: Partial<CreateMqttServerDto>) => void;
  t: (key: string) => string;
  dataCyPrefix: string;
}

export function TlsSection({ values, onChange, t, dataCyPrefix }: Readonly<TlsSectionProps>) {
  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.tls')}</h3>

      <LabeledSwitch
        id="useTls"
        name="useTls"
        isSelected={values.useTls}
        onChange={(checked) => onChange({ useTls: checked })}
        data-cy={`${dataCyPrefix}-use-tls-checkbox`}
      >
        {t('useTls')}
      </LabeledSwitch>

      {values.useTls && (
        <>
          <TextField
            value={values.caCert ?? ''}
            onChange={(v) => onChange({ caCert: v })}
            className="w-full"
          >
            <Label>{t('caCertLabel')}</Label>
            <TextArea
              id="caCert"
              name="caCert"
              rows={5}
              className="font-mono text-xs"
              placeholder={t('caCertPlaceholder')}
              data-cy={`${dataCyPrefix}-ca-cert-input`}
            />
            <Description>{t('caCertDescription')}</Description>
          </TextField>

          <TextField
            value={values.tlsServername ?? ''}
            onChange={(v) => onChange({ tlsServername: v })}
            className="w-full"
          >
            <Label>{t('tlsServernameLabel')}</Label>
            <Input
              id="tlsServername"
              name="tlsServername"
              placeholder={t('tlsServernamePlaceholder')}
              data-cy={`${dataCyPrefix}-tls-servername-input`}
            />
            <Description>{t('tlsServernameDescription')}</Description>
          </TextField>

          <LabeledSwitch
            id="tlsInsecure"
            name="tlsInsecure"
            isSelected={!!values.tlsInsecure}
            onChange={(checked) => onChange({ tlsInsecure: checked })}
            data-cy={`${dataCyPrefix}-tls-insecure-switch`}
          >
            {t('tlsInsecureLabel')}
          </LabeledSwitch>

          {values.tlsInsecure && (
            <Alert status="danger" data-cy={`${dataCyPrefix}-tls-insecure-warning`}>
              {/* status="danger" only colours the indicator and title, so both are required for the alert to read as a warning. */}
              <AlertIndicator>
                <AlertTriangleIcon size={16} />
              </AlertIndicator>
              <AlertContent>
                <AlertTitle>{t('tlsInsecureWarningTitle')}</AlertTitle>
                <AlertDescription>{t('tlsInsecureWarning')}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
        </>
      )}
    </section>
  );
}
