import { Button } from '@attraccess/plugins-frontend-ui';
import {
  type InstalledNpmPluginDto,
  usePluginControllerUpdateInstalledPackagePolicy,
  usePluginControllerUpdatePolicy,
} from '@attraccess/react-query-client';
import { Description, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { Select } from '../../../../../components/select/index';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useInstalledNpmPlugins } from '../installed/useInstalledNpmPlugins';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  packageName: string;
  /** The version to request when the package has no saved request yet. */
  fallbackSpec: string;
}

const OVERRIDES = ['inherit', 'off', 'patch', 'minor', 'follow'] as const;

/**
 * The package's update rules: which versions update checks offer, and so which ones automatic updates may install.
 * Saving them installs nothing right away.
 */
export function VersionPolicySettings({ packageName, fallbackSpec }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { installedByName, mergeInstalled } = useInstalledNpmPlugins();
  const installed = installedByName.get(packageName);
  const { data: globalUpdatePolicy } = usePluginControllerUpdatePolicy();
  const { mutateAsync: updateInstalledPluginPolicy, isPending } = usePluginControllerUpdateInstalledPackagePolicy();
  const [requestedSpec, setRequestedSpec] = useState(installed?.requestedSpec ?? fallbackSpec);
  const [updateOverride, setUpdateOverride] = useState<InstalledNpmPluginDto['updateOverride']>(
    installed?.updateOverride ?? 'inherit',
  );

  const save = async () => {
    try {
      mergeInstalled([
        await updateInstalledPluginPolicy({ path: { packageName }, body: { requestedSpec, updateOverride } }),
      ]);
      toast.success({ title: t('versionManagement.policySaved') });
    } catch {
      toast.error({ title: t('versionManagement.policyError') });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('versionManagement.settingsDescription')}</p>
      <TextField value={requestedSpec} onChange={setRequestedSpec}>
        <Label>{t('versionManagement.spec')}</Label>
        <Input />
        <Description>{t('versionManagement.specDescription')}</Description>
      </TextField>
      <Select
        label={t('versionManagement.autoUpdate')}
        value={updateOverride}
        onChange={(value) => setUpdateOverride(value as InstalledNpmPluginDto['updateOverride'])}
        items={OVERRIDES.map((value) => ({ key: value, label: t(`versionManagement.overrides.${value}`) }))}
      />
      {globalUpdatePolicy && !globalUpdatePolicy.automaticUpdates ? (
        <p className="text-sm text-muted" data-cy="plugins-list-override-inactive-hint">
          {t('versionManagement.automaticUpdatesOff')}
        </p>
      ) : null}
      <Button variant="secondary" className="self-start" isPending={isPending} onPress={() => void save()}>
        {t('versionManagement.savePolicy')}
      </Button>
    </div>
  );
}
