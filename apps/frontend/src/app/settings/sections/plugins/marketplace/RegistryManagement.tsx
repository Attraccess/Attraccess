import { Button } from '@attraccess/plugins-frontend-ui';
import {
  type PluginRegistryDto,
  UsePluginsServicePluginControllerListRegistriesKeyFn,
  usePluginsServicePluginControllerAddRegistry,
  usePluginsServicePluginControllerRemoveRegistry,
  usePluginsServicePluginControllerTestRegistry,
} from '@attraccess/react-query-client';
import { Input, TextField } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useRegistries } from './useRegistries';

interface Props {
  onRegistryRemoved: (registryId: string) => void;
}

export function RegistryManagement({ onRegistryRemoved }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: registries = [], refetch: refetchRegistries } = useRegistries();
  const { mutateAsync: addPluginRegistry } = usePluginsServicePluginControllerAddRegistry<PluginRegistryDto>();
  const { mutateAsync: testPluginRegistry } = usePluginsServicePluginControllerTestRegistry();
  const { mutateAsync: removePluginRegistry } = usePluginsServicePluginControllerRemoveRegistry();
  const [registryName, setRegistryName] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const [registryToken, setRegistryToken] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [testingRegistryId, setTestingRegistryId] = useState<string | null>(null);
  const latestRegistryTest = useRef<symbol | null>(null);

  // A load that is still in flight predates the change, so it is cancelled and its late response ignored.
  const reloadRegistries = async () => {
    await queryClient.cancelQueries({ queryKey: UsePluginsServicePluginControllerListRegistriesKeyFn() });
    await refetchRegistries({ throwOnError: true });
  };

  const addRegistry = async () => {
    setIsSavingRegistry(true);
    try {
      await addPluginRegistry({
        requestBody: { name: registryName, url: registryUrl, token: registryToken || undefined },
      });
      setRegistryName('');
      setRegistryUrl('');
      setRegistryToken('');
      await reloadRegistries();
      toast.success({ title: t('marketplace.registryAdded') });
    } catch {
      toast.error({ title: t('marketplace.registrySaveError') });
    } finally {
      setIsSavingRegistry(false);
    }
  };

  const testRegistry = async (registryId: string) => {
    const request = Symbol(registryId);
    latestRegistryTest.current = request;
    setTestingRegistryId(registryId);
    try {
      await testPluginRegistry({ registryId });
      toast.success({ title: t('marketplace.registryTestSuccess') });
    } catch {
      toast.error({ title: t('marketplace.registryTestError') });
    } finally {
      if (latestRegistryTest.current === request) {
        latestRegistryTest.current = null;
        setTestingRegistryId(null);
      }
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
          <TextField value={registryName} onChange={setRegistryName}>
            <Input placeholder={t('marketplace.registryName')} aria-label={t('marketplace.registryName')} />
          </TextField>
          <TextField value={registryUrl} onChange={setRegistryUrl}>
            <Input placeholder={t('marketplace.registryUrl')} aria-label={t('marketplace.registryUrl')} />
          </TextField>
          <TextField value={registryToken} onChange={setRegistryToken}>
            <Input
              type="password"
              placeholder={t('marketplace.registryToken')}
              aria-label={t('marketplace.registryToken')}
            />
          </TextField>
        </div>
        <div>
          <Button variant="secondary" onPress={() => void addRegistry()} isPending={isSavingRegistry}>
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
                isPending={testingRegistryId === registry.id}
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
