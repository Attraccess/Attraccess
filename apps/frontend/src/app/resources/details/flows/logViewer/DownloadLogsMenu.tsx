import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownPopover } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ResourceFlowLog, ResourceFlowNodeDto } from '@attraccess/react-query-client';
import { DownloadIcon } from 'lucide-react';
import { triggerDownload } from '../../../../../utils/download';
import { FlowOwner } from '../flowOwner';
import { flowLogFileName, toNdjson, toPlainText } from './flowLogExport';
import de from './de.json';
import en from './en.json';

interface DownloadLogsMenuProps {
  owner: FlowOwner;
  logs: (ResourceFlowLog & { node?: ResourceFlowNodeDto })[];
  nodeTitle: (node?: ResourceFlowNodeDto) => string;
}

export function DownloadLogsMenu({ owner, logs, nodeTitle }: Readonly<DownloadLogsMenuProps>) {
  const { t } = useTranslations({ de, en });

  // Files are built on click only: a full buffer can add up to several megabytes of text.
  const downloadNdjson = () => {
    triggerDownload(
      toNdjson(logs, nodeTitle),
      flowLogFileName(owner, new Date(), 'ndjson'),
      'application/x-ndjson;charset=utf-8',
    );
  };

  const downloadText = () => {
    const exportedAt = new Date();
    triggerDownload(
      toPlainText(logs, { owner, exportedAt, nodeTitle }),
      flowLogFileName(owner, exportedAt, 'txt'),
      'text/plain;charset=utf-8',
    );
  };

  return (
    <Dropdown>
      <Button variant="secondary" isDisabled={logs.length === 0} data-cy="flow-log-download">
        <DownloadIcon className="w-4 h-4" />
        {t('download.label')}
      </Button>
      <DropdownPopover>
        {/* onAction, not onPress: a held key or press-drag-release closes the menu before a press completes. */}
        <DropdownMenu aria-label={t('download.label')}>
          <DropdownItem id="ndjson" onAction={downloadNdjson} data-cy="flow-log-download-ndjson">
            {t('download.ndjson')}
          </DropdownItem>
          <DropdownItem id="text" onAction={downloadText} data-cy="flow-log-download-text">
            {t('download.text')}
          </DropdownItem>
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}
