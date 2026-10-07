import { useState } from 'react';
import type { VersionPlugin, VersionCandidate, InstalledNpmPlugin } from './index.contracts';
export function usePluginVersionSelection() {
  const [versionPlugin, setVersionPlugin] = useState<VersionPlugin | null>(null);
  const [versions, setVersions] = useState<VersionCandidate[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCandidate | null>(null);
  const [permissionApproved, setPermissionApproved] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [requestedSpec, setRequestedSpec] = useState('');
  const [updateOverride, setUpdateOverride] = useState<InstalledNpmPlugin['updateOverride']>('inherit');
  const [approvedVersionPlanToken, setApprovedVersionPlanToken] = useState<string | null>(null);
  const [majorApproved, setMajorApproved] = useState(false);
  const [approvedInstallPlanToken, setApprovedInstallPlanToken] = useState<string | null>(null);
  return {
    versionPlugin,
    setVersionPlugin,
    versions,
    setVersions,
    selectedVersion,
    setSelectedVersion,
    permissionApproved,
    setPermissionApproved,
    isLoadingVersions,
    setIsLoadingVersions,
    isReplacing,
    setIsReplacing,
    requestedSpec,
    setRequestedSpec,
    updateOverride,
    setUpdateOverride,
    approvedVersionPlanToken,
    setApprovedVersionPlanToken,
    majorApproved,
    setMajorApproved,
    approvedInstallPlanToken,
    setApprovedInstallPlanToken,
  };
}
