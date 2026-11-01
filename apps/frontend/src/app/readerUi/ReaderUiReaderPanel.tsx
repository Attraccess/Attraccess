import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ReaderUiAlerts } from './ReaderUiAlerts';
import { useReaderReaderUiSettings, useReaderUiContributions, useSaveReaderReaderUiSettings } from './readerUiApi';
import en from './en.json';
import de from './de.json';

/** Per-reader plugin widget toggle, contribution status and alerts for the reader editor. */
export function ReaderUiReaderPanel({ readerId }: Readonly<{ readerId: number }>) {
  const { t } = useTranslations({ en, de });
  const { data: settings } = useReaderReaderUiSettings(readerId);
  const { data: contributions } = useReaderUiContributions(readerId);
  const save = useSaveReaderReaderUiSettings(readerId);

  return (
    <div className="flex flex-col gap-4" data-cy="reader-ui-reader-panel">
      <LabeledSwitch
        isSelected={settings?.widgetsEnabled ?? true}
        isDisabled={!settings || save.isPending}
        onChange={(widgetsEnabled) => save.mutate({ widgetsEnabled })}
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
          <div key={`${c.plugin}-${c.resourceId}-${c.slot}-${c.key}`} className="flex justify-between gap-3 text-sm">
            <span>
              {c.plugin} · #{c.resourceId} · {c.slot}
            </span>
            <span data-cy={`reader-ui-status-${c.status}`}>
              {t(`reader.status.${c.status}`)}
              {c.reason ? `: ${c.reason}` : ''}
            </span>
          </div>
        ))}
      </div>

      <ReaderUiAlerts readerId={readerId} />
    </div>
  );
}
