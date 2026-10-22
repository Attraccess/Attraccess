import type { AuditLog } from '@attraccess/application-models';
import { AuditLabelReader, AuditLabelRow } from '../persistence/port';
import { AuditEntryDto } from '../dto/audit-response.dto';

const name = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

function recordedSubjectLabel(entry: AuditLog): string | undefined {
  const details = entry.details;
  if (name(details.subjectLabel)) return name(details.subjectLabel);
  if (entry.domain === 'administration' && entry.subjectType === 'mqtt-server') return name(details.serverName);
  if (entry.domain === 'administration' && entry.subjectType === 'plugin-package')
    return name(details.pluginName) ?? name(details.packageName);
  if (entry.domain === 'sso' && entry.subjectType === 'sso.provider') {
    for (const value of [details.after, details.before]) {
      if (typeof value !== 'string') continue;
      try {
        const provider = JSON.parse(value);
        if (provider?.id === entry.subjectId && name(provider.name)) return name(provider.name);
      } catch {
        /* Historical malformed snapshots retain their original details. */
      }
    }
  }
  // A maintenance schedule's name belongs to the schedule, not its resource subject.
  const isResource =
    entry.domain === 'resource' && entry.subjectType === 'resource' && entry.action.startsWith('resource.');
  const isGroup = entry.domain === 'resource' && entry.subjectType === 'resource_group';
  const isProject = entry.domain === 'project' && entry.subjectType === 'project';
  if (isResource || isGroup || isProject)
    return name(details['after.name']) ?? name(details['before.name']) ?? name(details.name);
  return undefined;
}

async function currentNames(
  read: (ids: readonly number[]) => Promise<AuditLabelRow[]>,
  ids: Array<number | null>,
): Promise<Map<number, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))];
  if (!uniqueIds.length) return new Map();
  try {
    const rows = await read(uniqueIds);
    return new Map(rows.filter((row) => name(row.label)).map((row) => [row.id, row.label]));
  } catch {
    // Readable history must remain available when optional current-name lookup fails.
    return new Map();
  }
}

/** Adds explicitly labelled read-time names without mutating immutable historical rows. */
export async function auditEntriesWithLabels(reader: AuditLabelReader, entries: AuditLog[]): Promise<AuditEntryDto[]> {
  const subjects = (domain: string, type: string) =>
    entries
      .filter((entry) => entry.domain === domain && entry.subjectType === type && !recordedSubjectLabel(entry))
      .map((entry) => entry.subjectId);
  const [users, resources, groups, projects] = await Promise.all([
    currentNames(
      (ids) => reader.userNames(ids),
      [
        ...entries.filter((entry) => !name(entry.details.actorUsername)).map((entry) => entry.actorId),
        ...subjects('identity', 'identity.user'),
        ...subjects('sso', 'user'),
      ],
    ),
    currentNames((ids) => reader.resourceNames(ids), subjects('resource', 'resource')),
    currentNames((ids) => reader.groupNames(ids), subjects('resource', 'resource_group')),
    currentNames((ids) => reader.projectNames(ids), subjects('project', 'project')),
  ]);
  return entries.map((entry) => {
    const recordedActor = name(entry.details.actorUsername);
    const actorUsername = recordedActor ?? users.get(entry.actorId);
    const recordedSubject = recordedSubjectLabel(entry);
    const subjectNames =
      entry.domain === 'resource' && entry.subjectType === 'resource'
        ? resources
        : entry.domain === 'resource' && entry.subjectType === 'resource_group'
          ? groups
          : entry.domain === 'project' && entry.subjectType === 'project'
            ? projects
            : (entry.domain === 'identity' && entry.subjectType === 'identity.user') ||
                (entry.domain === 'sso' && entry.subjectType === 'user')
              ? users
              : undefined;
    const subjectLabel = recordedSubject ?? subjectNames?.get(entry.subjectId);
    return {
      ...entry,
      ...(actorUsername
        ? { actorUsername, actorUsernameSource: recordedActor ? ('recorded' as const) : ('current' as const) }
        : {}),
      ...(subjectLabel
        ? { subjectLabel, subjectLabelSource: recordedSubject ? ('recorded' as const) : ('current' as const) }
        : {}),
    };
  });
}
