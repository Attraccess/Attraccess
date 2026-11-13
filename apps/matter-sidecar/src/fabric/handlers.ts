import type { BackupHeader } from '@attraccess/matter-contract';
import type { FeatureHandlers } from '../request-pipeline';
import type { FabricManager } from './manager';

type StageBody = { header: BackupHeader; payload: string };
type StageIdBody = { stageId: string };

/** The `fabric` and `backup` operations, served from the sidecar's persistent state. */
export function fabricHandlers(manager: FabricManager): FeatureHandlers {
  return {
    'fabric.get': () => manager.status(),
    'fabric.create': ({ body }) => manager.create((body as { label: string }).label),
    'backup.snapshot': () => manager.snapshot(),
    'backup.restore.stage': ({ body }) => {
      const { header, payload } = body as StageBody;
      return manager.stage(header, payload);
    },
    'backup.restore.commit': ({ body, signal }) => manager.commit((body as StageIdBody).stageId, signal),
    'backup.restore.rollback': ({ body }) => manager.rollback((body as StageIdBody).stageId),
    'backup.restore.finalize': ({ body }) => manager.finalize((body as StageIdBody).stageId),
    'backup.restore.abort': ({ body }) => manager.abort((body as StageIdBody).stageId),
  };
}
