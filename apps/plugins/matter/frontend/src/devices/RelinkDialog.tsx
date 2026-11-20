import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import {
  Label,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@heroui/react';
import { useCallback, useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { useMatterResource } from '../useMatterResource';
import { listNodes, type MatterNodeSummary } from './api';
import { identityMismatch, nodeLabel } from './nodeLabel';

/**
 * Relinks a detached device to the unclaimed device that took its place. Step one picks that source. When vendor,
 * product or serial number differ, step two asks to confirm the mismatch explicitly: it is never sent implicitly.
 */
export function RelinkDialog({
  target,
  isOpen,
  busy,
  onClose,
  onRelink,
}: Readonly<{
  target: MatterNodeSummary;
  isOpen: boolean;
  busy: boolean;
  onClose: () => void;
  onRelink: (sourceNodeId: string, confirmIdentityMismatch: boolean) => void;
}>) {
  const { t } = useMatterTranslations();
  const load = useCallback(() => listNodes(false), []);
  const { data, error, loading } = useMatterResource(load, isOpen);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fallback = (nodeId: string) => t('devices.nodeFallback', { nodeId });
  const sources = (data ?? []).filter((node) => node.lifecycleState === 'unclaimed' && node.id !== target.id);
  const source = sources.find((node) => node.id === sourceId);
  const mismatch = source ? identityMismatch(target.identity, source.identity) : [];

  const close = () => {
    setSourceId(null);
    setConfirming(false);
    onClose();
  };

  if (confirming && source) {
    return (
      <StatusDialog
        isOpen={isOpen}
        status="warning"
        title={t('devices.relink.mismatchTitle')}
        onClose={() => setConfirming(false)}
        closeLabel={t('devices.relink.back')}
        action={{
          label: t('devices.relink.confirm'),
          isPending: busy,
          onPress: () => onRelink(source.id, true),
          'data-cy': 'matter-relink-confirm-mismatch',
        }}
        data-cy="matter-relink-mismatch-dialog"
      >
        {t('devices.relink.mismatchText', {
          fields: mismatch.map((field) => t(`devices.relink.field.${field}`)).join(', '),
        })}
      </StatusDialog>
    );
  }

  return (
    <StatusDialog
      isOpen={isOpen}
      status="info"
      title={t('devices.relink.title')}
      onClose={close}
      action={{
        label: t('devices.relink.next'),
        isPending: busy,
        isDisabled: !source,
        onPress: () => (mismatch.length > 0 ? setConfirming(true) : onRelink(source?.id ?? '', false)),
        'data-cy': 'matter-relink-next',
      }}
      data-cy="matter-relink-dialog"
    >
      <div className="mt:flex mt:flex-col mt:gap-3">
        <p>{t('devices.relink.text')}</p>
        {loading && <Spinner size="sm" />}
        {error && <p className="mt:text-danger">{error}</p>}
        {!loading && !error && sources.length === 0 && <p data-cy="matter-relink-none">{t('devices.relink.none')}</p>}
        {sources.length > 0 && (
          <Select
            aria-label={t('devices.relink.source')}
            value={sourceId}
            onChange={(key) => setSourceId(key === null ? null : String(key))}
            placeholder={t('devices.relink.source')}
            fullWidth
            data-cy="matter-relink-source"
          >
            <Label>{t('devices.relink.source')}</Label>
            <SelectTrigger>
              <SelectValue />
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {sources.map((node) => (
                  <ListBoxItem key={node.id} id={node.id} textValue={nodeLabel(node, fallback)}>
                    {nodeLabel(node, fallback)}
                  </ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </Select>
        )}
      </div>
    </StatusDialog>
  );
}
