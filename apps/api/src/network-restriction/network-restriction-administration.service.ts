import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { NETWORK_RESTRICTED_ACTIONS } from '@attraccess/application-models';
import { auditSubjectKeyId } from '../audit/policies/administration';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../audit/recorder/audit-event';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictionService } from './network-restriction.service';
import { NETWORK_RESTRICTION_STORE, NetworkRestrictionStore } from './network-restriction.port';
import { parseRoleActionsUpdate } from './network-restriction.config';
import { serverInterfaceRanges, subnetOf } from './network-suggestions';
import type { OriginRequest } from './network-origin';
import type { NetworkRestrictionRoleMatrixDto, NetworkRestrictionSettingsDto } from './network-restriction.dto';

/** An audit value is at most 256 characters. */
const clip = (value: string) => (value.length <= 256 ? value : `${value.slice(0, 255)}…`);

/**
 * A range list change for the audit log: both lists when they fit, otherwise what was removed and what was added, so a
 * range appended to a long list is not cut off.
 */
function rangesChange(before: string[], after: string[]): [string, string] {
  const full: [string, string] = [before.join(','), after.join(',')];
  if (full.every((value) => value.length <= 256)) return full;
  return [
    `removed: ${before.filter((range) => !after.includes(range)).join(',')}`,
    `added: ${after.filter((range) => !before.includes(range)).join(',')}`,
  ];
}

/** Administrator reads and changes of the network restriction: the settings and the role × action matrix. */
@Injectable()
export class NetworkRestrictionAdministrationService {
  constructor(
    private readonly config: NetworkRestrictionConfigService,
    private readonly restriction: NetworkRestrictionService,
    @Inject(NETWORK_RESTRICTION_STORE) private readonly store: NetworkRestrictionStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async settings(request: OriginRequest): Promise<NetworkRestrictionSettingsDto> {
    const config = await this.config.get();
    const detectedAddress = await this.restriction.originOf(request, config);
    return {
      ...config,
      detectedAddress,
      detectedInside: this.config.isInside(config, detectedAddress),
      detectedSubnet: detectedAddress === null ? null : subnetOf(detectedAddress),
      serverRanges: serverInterfaceRanges(),
    };
  }

  async updateSettings(body: unknown, actor: AuditActor, request: OriginRequest) {
    const before = await this.config.get();
    const after = await this.config.update(body);
    for (const field of ['enabled', 'allowedRanges', 'ipSource', 'headerName'] as const) {
      if (String(before[field]) === String(after[field])) continue;
      const [oldValue, newValue] =
        field === 'allowedRanges'
          ? rangesChange(before.allowedRanges, after.allowedRanges)
          : [String(before[field]), String(after[field])];
      await this.record(actor, `networkRestriction.${field}`, oldValue, newValue);
    }
    return this.settings(request);
  }

  async roleMatrix(): Promise<NetworkRestrictionRoleMatrixDto> {
    return { actions: [...NETWORK_RESTRICTED_ACTIONS], roles: await this.store.listRoleActions() };
  }

  async updateRoleMatrix(body: unknown, actor: AuditActor): Promise<NetworkRestrictionRoleMatrixDto> {
    const updates = parseRoleActionsUpdate(body);
    const known = new Set(await this.store.existingRoleIds(updates.map((update) => update.roleId)));
    const missing = updates.find((update) => !known.has(update.roleId));
    if (missing) throw new BadRequestException(`Unknown role: ${missing.roleId}`);

    const before = new Map((await this.store.listRoleActions()).map((role) => [role.roleId, role]));
    await this.store.replaceRoleActions(updates);
    for (const { roleId, actions } of updates) {
      const role = before.get(roleId);
      const oldActions = [...(role?.actions ?? [])].sort().join(',');
      const newActions = [...actions].sort().join(',');
      if (oldActions === newActions) continue;
      const label = `${role?.key ?? roleId}: `;
      await this.record(actor, 'networkRestriction.roleActions', clip(label + oldActions), clip(label + newActions));
    }
    return this.roleMatrix();
  }

  private async record(actor: AuditActor, key: string, before: string, after: string) {
    await this.audit.record({
      domain: 'administration',
      action: 'settings.updated',
      actor,
      subject: { type: 'setting', id: auditSubjectKeyId(key) },
      details: { settingKey: key, before: clip(before), after: clip(after) },
    });
  }
}
