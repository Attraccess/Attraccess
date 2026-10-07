import { WAGO_PRESETS } from './configuration.state';
import { type WagoAuditLifecycle } from './wago-audit';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import {
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  configurationDiff,
  type ConfigurationValidationError,
} from './configuration';
import { type ConfigurationEditorMetadata } from './configuration-editor';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { ConfigurationDiff } from './configuration.configuration-diff';

export abstract class WagoConfigurationContract {
  abstract getDraft(controllerId: number): Promise<WagoConfigurationDraft | null>;
  abstract getConfigurationBaseline(controllerId: number): Promise<WagoConfigurationRevision | null>;
  abstract saveDraft(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
    principal?: PluginAuditPrincipal,
    expectedDraft?: Pick<WagoConfigurationDraft, 'snapshot' | 'presetProvenance' | 'updatedAt'> | null,
  ): Promise<WagoConfigurationDraft>;
  abstract presets(): typeof WAGO_PRESETS;

  abstract previewPreset(
    controllerId: number,
    application: WagoPresetApplication,
    snapshot?: WagoConfigurationSnapshot,
  ): Promise<{
    draftHash: string;
    snapshot: WagoConfigurationSnapshot;
    diff: ConfigurationDiff[];
    errors: ConfigurationValidationError[];
  }>;
  abstract validateDraft(
    controllerId: number,
    snapshot?: unknown,
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }>;
  protected abstract draftForPreset(controllerId: number): Promise<WagoConfigurationDraft>;
  abstract applyPreset(
    controllerId: number,
    application: WagoPresetApplication,
    selectedPaths: string[],
    previewedDraftHash: string,
    snapshotOrPrincipal?: WagoConfigurationSnapshot | PluginAuditPrincipal,
    principal?: PluginAuditPrincipal,
  ): Promise<Pick<WagoConfigurationDraft, 'snapshot'>>;
  abstract revisionsFor(
    controllerId: number,
    offset?: number,
    limit?: number,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }>;
  abstract reviewDraft(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;
  abstract publishDraft(
    controllerId: number,
    force?: boolean,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;
  abstract rollback(
    controllerId: number,
    revision: number,
    force?: boolean,
    sourceHash?: string,
    currentHash?: string | null,
    draftHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;
  abstract acknowledgeRejection(
    controllerId: number,
    revision: number,
    expected: { contentHash?: string; reportedAt?: string },
    principal: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision>;
  abstract previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;
  protected abstract revisionIdentity(revision: WagoConfigurationRevision | null): unknown;
  protected abstract impactIdentity(impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>): unknown;
  protected abstract reviewIdentity(
    draft: WagoConfigurationDraft,
    current: WagoConfigurationRevision | null,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string;
  protected abstract rollbackIdentity(
    draft: WagoConfigurationDraft | null,
    current: WagoConfigurationRevision | null,
    source: WagoConfigurationRevision,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string;
  protected abstract draftIdentity(draft: WagoConfigurationDraft | null): string;
  protected abstract metadataFromProvenance(provenance: string | null | undefined): ConfigurationEditorMetadata;
  protected abstract saveDraftWhileLocked(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
  ): Promise<WagoConfigurationDraft>;
  protected abstract reviewDraftWhileLocked(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }>;
  protected abstract requireConfigurationCompatibility(controller: WagoController): void;
  protected abstract publishDraftWhileLocked(
    controllerId: number,
    force?: boolean,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
    preparedDraft?: WagoConfigurationDraft,
    onAllocated?: (revision: number) => void,
  ): Promise<WagoConfigurationRevision>;
  protected abstract auditRevision(
    lifecycle: WagoAuditLifecycle | undefined,
    operation: () => Promise<WagoConfigurationRevision>,
    allocated: () => number | undefined,
  ): Promise<WagoConfigurationRevision>;
  protected abstract latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null>;
}
