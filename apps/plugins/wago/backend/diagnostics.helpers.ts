import { WagoService } from './wago.service';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { safeValidationSummaries } from './diagnostics-validation';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { validateSnapshot } from './configuration';
import type { WagoDiagnostics } from '../diagnostics-types';
import { configurationHash } from './configuration';

export function configurationRejections(
  latest: WagoConfigurationRevision | null,
  runtime: ReturnType<WagoService['diagnostics']['read']>,
) {
  return latest?.rejectionErrors
    ? safeValidationSummaries(JSON.parse(latest.rejectionErrors))
    : latest && runtime.rejection?.revision === latest.revision && runtime.rejection.contentHash === latest.contentHash
      ? runtime.rejection.errors
      : [];
}

export function hasDraftChanges(
  draft: WagoConfigurationDraft | null,
  latest: WagoConfigurationRevision | null,
): boolean {
  return (
    !!draft &&
    (!latest ||
      configurationHash(JSON.parse(draft.snapshot)) !== latest.contentHash ||
      configurationHash({ metadata: draft.presetProvenance ? JSON.parse(draft.presetProvenance) : null }) !==
        configurationHash({ metadata: latest.presetProvenance ? JSON.parse(latest.presetProvenance) : null }))
  );
}

export function configurationSummary(
  draft: WagoConfigurationDraft | null,
  latest: WagoConfigurationRevision | null,
  applied: WagoConfigurationRevision | null,
  runtime: ReturnType<WagoService['diagnostics']['read']>,
  revisionMismatch: boolean,
): WagoDiagnostics['configuration'] {
  const validationErrors = draft ? validateSnapshot(JSON.parse(draft.snapshot)) : [];
  return {
    draftUpdatedAt: draft?.updatedAt ?? null,
    draftChanged: hasDraftChanges(draft, latest),
    validationErrorCount: validationErrors.length,
    // Codes originate in our validator. Omit messages and dynamic paths, which can include arbitrary draft values.
    validationCodes: [...new Set(validationErrors.map((error) => error.code))].slice(0, 50),
    validationErrors: safeValidationSummaries(validationErrors),
    rejectionErrors: configurationRejections(latest, runtime),
    publishedRevision: latest?.revision ?? null,
    publishedState: latest?.state ?? null,
    appliedRevision: applied?.revision ?? null,
    reportedRevision: runtime.revision ?? null,
    revisionMismatch,
    rejected: latest?.state === 'rejected',
  };
}
export function own<T>(values: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

export function diagnosticReferences(
  nodes: Array<{ id: string; resourceId: number; type: string; data: Record<string, unknown> }>,
  channelIds: string[],
  revision: number | null,
  capabilities?: Record<string, string[]>,
) {
  return nodes.map((node) => {
    const channelId = typeof node.data.channelId === 'string' ? node.data.channelId : '';
    const control = node.type === 'plugin.wago.command';
    const conflictResourceIds = control
      ? [
          ...new Set(
            nodes
              .filter(
                (other) =>
                  other.type === 'plugin.wago.command' &&
                  other.resourceId !== node.resourceId &&
                  other.data.channelId === channelId,
              )
              .map((other) => other.resourceId),
          ),
        ]
      : [];
    return {
      nodeId: node.id,
      resourceId: node.resourceId,
      channelId,
      control,
      href: `/resources/${node.resourceId}/flows?node=${encodeURIComponent(node.id)}`,
      invalid:
        !channelIds.includes(channelId) ||
        (control &&
          (node.data.expectedConfigurationRevision !== revision ||
            (capabilities &&
              (!own(capabilities, channelId)?.includes('output') ||
                (node.data.action === 'pulse' && !own(capabilities, channelId)?.includes('pulse')))))),
      conflict: conflictResourceIds.length > 0,
      conflictResourceIds,
    };
  });
}

export function runtimeStreamSummary(runtime: ReturnType<WagoService['diagnostics']['read']>) {
  return {
    sequenceGaps: runtime.activeStream ? runtime.sequenceGaps : null,
    activeStream: runtime.activeStream ?? null,
    trackingExhausted: runtime.trackingExhausted,
    stateConnected: runtime.connected ?? null,
    stateHardwareAvailable: runtime.hardwareAvailable ?? null,
    stateSourceAt: runtime.stateSourceAt ?? null,
    sequenceExplanation: runtime.activeStream
      ? 'Gaps are scoped to boot stream ID and message category; duplicates and retired streams are ignored.'
      : 'Legacy payloads have no source envelope; sequence gaps and source freshness are unavailable.',
  };
}
