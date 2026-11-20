// Shared, visible header text of a table's last column holding the TableRowActions
// FEATURE: every table labels its actions column the same way
import { useTranslations } from '../../i18n';
import en from './en.json';
import de from './de.json';

/** Use as the content of the last `TableColumn`: "Actions" / "Aktionen", centred above the ⋮ triggers. */
export function TableActionsColumnHeader() {
  const { t } = useTranslations({ en, de });
  return <span className="block text-center">{t('column')}</span>;
}
