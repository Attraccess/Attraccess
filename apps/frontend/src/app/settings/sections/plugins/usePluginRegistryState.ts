import { useState } from 'react';
import type { Registry } from './index.contracts';
export function usePluginRegistryState() {
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [registryName, setRegistryName] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const [registryToken, setRegistryToken] = useState('');
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);
  const [testingRegistryId, setTestingRegistryId] = useState<string | null>(null);
  return {
    registries,
    setRegistries,
    registryName,
    setRegistryName,
    registryUrl,
    setRegistryUrl,
    registryToken,
    setRegistryToken,
    isSavingRegistry,
    setIsSavingRegistry,
    testingRegistryId,
    setTestingRegistryId,
  };
}
