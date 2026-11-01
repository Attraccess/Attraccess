import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Select } from '../../components/select';
import { useToastMessage } from '../../components/toastProvider';
import {
  useResourceReaderUiSettings,
  useSaveResourceReaderUiSettings,
  type HookFailurePolicy,
  type NoScreenPolicy,
  type ResourceReaderUiSettings as Settings,
} from './readerUiApi';
import en from './en.json';
import de from './de.json';

const DEFAULT_KEY = 'default';
const POLICIES: NoScreenPolicy[] = ['block', 'card-confirm', 'allow-with-warning'];
const FAILURE_POLICIES: HookFailurePolicy[] = ['fail-closed', 'fail-open'];

export function ResourceReaderUiSettings({ resourceId }: Readonly<{ resourceId: number }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { data, isLoading } = useResourceReaderUiSettings(resourceId);
  const [draft, setDraft] = useState<Settings | null>(null);
  const save = useSaveResourceReaderUiSettings(resourceId);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) return <Spinner />;

  const updatePlugin = (plugin: string, change: Partial<Settings['plugins'][number]>) =>
    setDraft({ ...draft, plugins: draft.plugins.map((p) => (p.plugin === plugin ? { ...p, ...change } : p)) });

  const onSave = () =>
    save.mutate(draft, {
      onSuccess: () => toast.success({ title: t('resource.saved') }),
      onError: () => toast.error({ title: t('resource.saveError') }),
    });

  return (
    <div className="flex flex-col gap-5" data-cy="resource-reader-ui-settings">
      <Select
        label={t('resource.noScreenPolicy.label')}
        description={t('resource.noScreenPolicy.description')}
        value={draft.noScreenPolicy ?? DEFAULT_KEY}
        onChange={(key) => setDraft({ ...draft, noScreenPolicy: key === DEFAULT_KEY ? null : (key as NoScreenPolicy) })}
        items={[
          { key: DEFAULT_KEY, label: t('resource.noScreenPolicy.default') },
          ...POLICIES.map((policy) => ({ key: policy, label: t(`resource.noScreenPolicy.${policy}`) })),
        ]}
        data-cy="reader-ui-no-screen-policy"
      />

      <h3 className="font-semibold">{t('resource.plugins')}</h3>
      {draft.plugins.length === 0 && <p className="text-muted">{t('resource.noPlugins')}</p>}
      {draft.plugins.map((entry) => (
        <div key={entry.plugin} className="flex flex-col gap-3" data-cy={`reader-ui-plugin-${entry.plugin}`}>
          <span className="font-medium">{entry.plugin}</span>
          <LabeledSwitch
            isSelected={entry.widgetsEnabled}
            onChange={(value) => updatePlugin(entry.plugin, { widgetsEnabled: value })}
          >
            {t('resource.widgets')}
          </LabeledSwitch>
          <Select
            label={t('resource.failurePolicy.label')}
            value={entry.hookFailurePolicy}
            onChange={(key) => updatePlugin(entry.plugin, { hookFailurePolicy: key as HookFailurePolicy })}
            items={FAILURE_POLICIES.map((policy) => ({ key: policy, label: t(`resource.failurePolicy.${policy}`) }))}
            description={entry.hookFailurePolicy === 'fail-open' ? t('resource.failOpenWarning') : undefined}
          />
        </div>
      ))}

      <div className="flex justify-end">
        <Button variant="primary" onPress={onSave} isPending={save.isPending} data-cy="reader-ui-settings-save">
          {t('resource.save')}
        </Button>
      </div>
    </div>
  );
}
