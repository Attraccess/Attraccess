import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../components/toastProvider';
import { ReaderUiAlerts } from './ReaderUiAlerts';
import { useReaderReaderUiSettings, useReaderUiContributions, useSaveReaderReaderUiSettings } from './readerUiApi';
import { reasonLabel, slotLabelKey } from './readerUiLabels';
import en from './en.json';
import de from './de.json';

type Translate = (key: string, options?: Record<string, unknown>) => string;

interface Contribution {
  plugin: string;
  resourceId: number;
  slot: string;
  key: string;
  status: string;
  reason?: string;
}

function ContributionRow({
  contribution: c,
  resourceName,
  t,
}: Readonly<{ contribution: Contribution; resourceName: string; t: Translate }>) {
  const slotKey = slotLabelKey(c.slot);
  const reason = c.reason ? reasonLabel(c.reason) : null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span>
        {c.plugin} · {resourceName} · {slotKey ? t(slotKey) : c.slot}
      </span>
      <span className="flex flex-col items-end text-right" data-cy={`reader-ui-status-${c.status}`}>
        <span>
          {t(`reader.status.${c.status}`)}
          {reason?.key ? `: ${t(reason.key)}` : ''}
        </span>
        {reason?.detail && <span className="text-xs text-muted">{reason.detail}</span>}
      </span>
    </div>
  );
}

/** Per-reader plugin widget toggle, contribution status and alerts for the reader editor. */
export function ReaderUiReaderPanel({
  readerId,
  resources = [],
}: Readonly<{ readerId: number; resources?: ReadonlyArray<{ id: number; name: string }> }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { data: settings } = useReaderReaderUiSettings(readerId);
  const { data: contributions } = useReaderUiContributions(readerId);
  const save = useSaveReaderReaderUiSettings(readerId);
  const resourceName = (id: number) => resources.find((r) => r.id === id)?.name ?? t('reader.resourceFallback', { id });

  // This tab saves on change (like pairing), not with the editor's Save button.
  const onWidgetsChange = (widgetsEnabled: boolean) =>
    save.mutate(
      { widgetsEnabled },
      {
        onSuccess: () => toast.success({ title: t('reader.saved') }),
        onError: () => toast.error({ title: t('reader.saveError') }),
      },
    );

  return (
    <div className="flex flex-col gap-4" data-cy="reader-ui-reader-panel">
      <p className="text-sm text-muted">{t('reader.savedImmediately')}</p>
      <LabeledSwitch
        isSelected={settings?.widgetsEnabled ?? true}
        isDisabled={!settings || save.isPending}
        onChange={onWidgetsChange}
        data-cy="reader-ui-widgets-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('reader.widgets')}</span>
          <span className="text-tiny text-default-400">{t('reader.widgetsDescription')}</span>
        </div>
      </LabeledSwitch>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('reader.contributions')}</h3>
        {(contributions ?? []).length === 0 && <p className="text-muted">{t('reader.noContributions')}</p>}
        {(contributions ?? []).map((c) => (
          <ContributionRow
            key={`${c.plugin}-${c.resourceId}-${c.slot}-${c.key}`}
            contribution={c}
            resourceName={resourceName(c.resourceId)}
            t={t}
          />
        ))}
      </div>

      <ReaderUiAlerts readerId={readerId} />
    </div>
  );
}
