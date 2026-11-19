import { useState } from 'react';
import { Button } from '@heroui/react';
import { DownloadIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { auditControllerList } from '@attraccess/react-query-client';
import { useAuth } from '../../../../../hooks/useAuth';
import { auditCsv, exportAuditEntries } from '../audit-log-model';
import { AuditLogFilterState } from '../useAuditLogFilterState';
import { useAuditLogActivity } from '../useAuditLogActivity';
import en from '../en.json';
import de from '../de.json';

interface AuditLogExportButtonProps {
  filterState: AuditLogFilterState;
  onExportError: (failed: boolean) => void;
}

export function AuditLogExportButton({ filterState, onExportError }: AuditLogExportButtonProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const { activity, appliedFilterError, filterQuery } = useAuditLogActivity(filterState);
  const [exporting, setExporting] = useState(false);
  const exportFiltered = async () => {
    // Exporting without the invalid filter would silently export more than the user asked for.
    if (!filterQuery) return;
    setExporting(true);
    onExportError(false);
    try {
      const entries = await exportAuditEntries(filterQuery, (query) =>
        auditControllerList({ query, throwOnError: true }).then(({ data }) => data),
      );
      const url = URL.createObjectURL(new Blob([auditCsv(entries)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      onExportError(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <Button
      variant="outline"
      onPress={exportFiltered}
      isPending={exporting}
      isDisabled={!hasPermission('system.audit.read') || activity.isError || appliedFilterError !== undefined}
    >
      {<DownloadIcon size={16} />}
      {exporting ? t('exporting') : t('export')}
    </Button>
  );
}
