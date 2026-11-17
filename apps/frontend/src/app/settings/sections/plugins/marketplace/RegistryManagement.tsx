import { Button } from '@attraccess/plugins-frontend-ui';
import {
  UsePluginsServicePluginControllerListRegistriesKeyFn,
  usePluginsServicePluginControllerAddRegistry,
  usePluginsServicePluginControllerRemoveRegistry,
  usePluginsServicePluginControllerTestRegistry,
} from '@attraccess/react-query-client';
import { Input, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import type { RegistryForm } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useRegistries } from './useRegistries';

interface Props {
  form: RegistryForm;
  onFormChange: Dispatch<SetStateAction<RegistryForm>>;
  onRegistryRemoved: (registryId: string) => void;
}

export function RegistryManagement({ form, onFormChange, onRegistryRemoved }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: registries = [], refetch: refetchRegistries } = useRegistries();
  const { mutateAsync: addPluginRegistry } = usePluginsServicePluginControllerAddRegistry();
  const { mutateAsync: testPluginRegistry } = usePluginsServicePluginControllerTestRegistry();
  const { mutateAsync: removePluginRegistry } = usePluginsServicePluginControllerRemoveRegistry();

  // A load that is still in flight predates the change, so it is cancelled and its late response ignored.
  const reloadRegistries = async () => {
    await queryClient.cancelQueries({ queryKey: UsePluginsServicePluginControllerListRegistriesKeyFn() });
    await refetchRegistries({ throwOnError: true });
  };

  const addRegistry = async () => {
    onFormChange((current) => ({ ...current, isSaving: true }));
    try {
      await addPluginRegistry({
        requestBody: { name: form.name, url: form.url, token: form.token || undefined },
      });
      onFormChange((current) => ({ ...current, name: '', url: '', token: '' }));
      await reloadRegistries();
      toast.success({ title: t('marketplace.registryAdded') });
    } catch {
      toast.error({ title: t('marketplace.registrySaveError') });
    } finally {
      onFormChange((current) => ({ ...current, isSaving: false }));
    }
  };

  const testRegistry = async (registryId: string) => {
    const request = Symbol(registryId);
    onFormChange((current) => ({ ...current, test: { registryId, request } }));
    try {
      await testPluginRegistry({ registryId });
      toast.success({ title: t('marketplace.registryTestSuccess') });
    } catch {
      toast.error({ title: t('marketplace.registryTestError') });
    } finally {
      onFormChange((current) => (current.test?.request === request ? { ...current, test: null } : current));
    }
  };

  const removeRegistry = async (registryId: string) => {
    try {
      await removePluginRegistry({ registryId });
      onRegistryRemoved(registryId);
      await reloadRegistries();
    } catch {
      toast.error({ title: t('marketplace.registryRemoveError') });
    }
  };

  return (
    <details className="border-t border-divider pt-4">
      <summary className="cursor-pointer font-medium text-foreground">{t('marketplace.registryManagement')}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <TextField value={form.name} onChange={(name) => onFormChange((current) => ({ ...current, name }))}>
            <Input placeholder={t('marketplace.registryName')} aria-label={t('marketplace.registryName')} />
          </TextField>
          <TextField value={form.url} onChange={(url) => onFormChange((current) => ({ ...current, url }))}>
            <Input placeholder={t('marketplace.registryUrl')} aria-label={t('marketplace.registryUrl')} />
          </TextField>
          <TextField value={form.token} onChange={(token) => onFormChange((current) => ({ ...current, token }))}>
            <Input
              type="password"
              placeholder={t('marketplace.registryToken')}
              aria-label={t('marketplace.registryToken')}
            />
          </TextField>
        </div>
        <div>
          <Button variant="secondary" onPress={() => void addRegistry()} isPending={form.isSaving}>
            {t('marketplace.addRegistry')}
          </Button>
        </div>
        {registries.map((registry) => (
          <div
            key={registry.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-medium border border-divider p-3 text-sm"
          >
            <span>
              {registry.name} · {registry.url} ·{' '}
              {registry.tokenConfigured ? t('marketplace.tokenConfigured') : t('marketplace.noToken')}
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onPress={() => void testRegistry(registry.id)}
                isPending={form.test?.registryId === registry.id}
              >
                {t('marketplace.testRegistry')}
              </Button>
              <Button variant="danger-soft" size="sm" onPress={() => void removeRegistry(registry.id)}>
                {t('marketplace.removeRegistry')}
              </Button>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
