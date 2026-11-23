import { SupervisionMode } from '@attraccess/application-models';
import { publishedState } from '../../../resources/usage/sessions/published-state';

/** The value `:viewerId` must be bound to when {@link permittedResourceSql} is used. */
export const VIEWER_PARAMETER = 'viewerId';

/** Quoted-column form of the published, unfinished session condition (the query-builder form lives in active-usage-queries). */
const activeSessionSql = (alias: string) =>
  `"${alias}"."endTime" IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `"${alias}"."${column}" = ${typeof value === 'boolean' ? String(value) : `'${value}'`}`)
    .join(' AND ')}`;

/** Group ids a resource belongs to. */
const groupsOf = (resourceIdSql: string) =>
  `SELECT "rgm"."resourceGroupId" FROM "resource_groups_resource_group" "rgm" WHERE "rgm"."resourceId" = ${resourceIdSql}`;

/**
 * True when the user may see the machine under the "permitted-only" rule (ATT-843): introducer or maintainer of it,
 * directly or through one of its groups; a currently granted introduction to it, directly or through a group (the
 * latest history item is a grant, so an introduction blocked by retraining still counts); a running session on it; or
 * the machine allows or requires supervised use, so anyone may use it with a supervisor and must be able to find it.
 * Managers are decided by the caller, not here.
 *
 * `resourceIdSql` is the SQL expression of the machine's id. The viewer is the `:viewerId` named parameter.
 */
export function permittedResourceSql(resourceIdSql: string): string {
  const viewer = `:${VIEWER_PARAMETER}`;
  return `(
    EXISTS (
      SELECT 1 FROM "resource_introducer" "pri"
      WHERE "pri"."userId" = ${viewer}
      AND ("pri"."resourceId" = ${resourceIdSql} OR "pri"."resourceGroupId" IN (${groupsOf(resourceIdSql)}))
    )
    OR EXISTS (
      SELECT 1 FROM "resource_introduction" "prin"
      WHERE "prin"."receiverUserId" = ${viewer}
      AND ("prin"."resourceId" = ${resourceIdSql} OR "prin"."resourceGroupId" IN (${groupsOf(resourceIdSql)}))
      AND (
        SELECT "ph"."action" FROM "resource_introduction_history_item" "ph"
        WHERE "ph"."introductionId" = "prin"."id"
        ORDER BY "ph"."createdAt" DESC, "ph"."id" DESC
        LIMIT 1
      ) = 'grant'
    )
    OR EXISTS (
      SELECT 1 FROM "resource" "psr"
      WHERE "psr"."id" = ${resourceIdSql} AND "psr"."supervisionMode" <> '${SupervisionMode.INTRODUCTION_REQUIRED}'
    )
    OR EXISTS (
      SELECT 1 FROM "resource_usage" "pu"
      WHERE "pu"."resourceId" = ${resourceIdSql} AND "pu"."userId" = ${viewer} AND ${activeSessionSql('pu')}
    )
  )`;
}
