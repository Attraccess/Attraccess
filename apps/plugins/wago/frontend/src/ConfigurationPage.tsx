import { useNavigate, useParams } from 'react-router-dom';
import { ConfigurationEditor } from './ConfigurationEditor';
import { useWagoTranslations } from './i18n';

export function ConfigurationPage() {
  const { t } = useWagoTranslations();
  const { controllerId } = useParams<{ controllerId: string }>();
  const navigate = useNavigate();
  const id = Number(controllerId);
  if (!Number.isSafeInteger(id) || id < 1) return <p role="alert">{t('configuration.invalidController')}</p>;
  return (
    <ConfigurationEditor
      controllerId={id}
      onOpenChange={(open) => {
        if (!open) navigate('/wago');
      }}
    />
  );
}
