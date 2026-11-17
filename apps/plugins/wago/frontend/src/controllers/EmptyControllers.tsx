import { EmptyState } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../i18n';

export function EmptyControllers({ searching = false }: { searching?: boolean }) {
  const { t } = useWagoTranslations();
  return <EmptyState message={t(searching ? 'controllers.noResults' : 'controllers.empty')} />;
}
