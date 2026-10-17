import { useNavigate, useParams } from 'react-router-dom';
import { FrontPanel } from '../front-panel/FrontPanel';
import { useWagoTranslations } from '../i18n';

export function ConfigurationPage() {
  const { t } = useWagoTranslations();
  const { controllerId } = useParams<{ controllerId: string }>();
  const navigate = useNavigate();
  const id = Number(controllerId);
  if (!Number.isSafeInteger(id) || id < 1) return <p role="alert">{t('configuration.invalidController')}</p>;
  return (
    <FrontPanel
      key={id}
      controllerId={id}
      onClose={() => navigate('/wago')}
      onHistory={() => navigate(`/wago/controllers/${id}/configuration/history`)}
    />
  );
}
