import type { PluginContext as LegacySqliteContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from '../../commissioning/sessions/session.entity';
import type { Resource, ResourceFlowNode } from '@attraccess/plugins-backend-sdk/v2';
import { WagoConfigurationDraft } from '../../configuration/draft.entity';
import { WagoDiagnosticsPersistence, WagoControllerDiagnosticSnapshot } from './port';
import type { Repository } from '@attraccess/plugins-backend-sdk/adapter';
import { WagoController } from '../../controllers/entity';
import { WagoSettings } from '../../controllers/settings.entity';
import { WagoConfigurationRevision } from '../../configuration/revision.entity';
import { WagoFlowPersistence } from './port';

export class TypeormWagoFlowPersistence extends WagoFlowPersistence {
  constructor(
    private readonly controllerSource: () => Repository<WagoController>,
    private readonly revisionSource: () => Repository<WagoConfigurationRevision>,
    private readonly settingsSource: () => Repository<WagoSettings>,
  ) {
    super();
  }
  private get controllers() {
    return this.controllerSource();
  }
  private get revisions() {
    return this.revisionSource();
  }
  private get preferences() {
    return this.settingsSource();
  }
  async claimedControllers(id?: number, orderByName = false) {
    return (
      await this.controllers.find({
        where: { trustState: 'claimed', ...(id === undefined ? {} : { id }) },
        ...(orderByName ? { order: { name: 'ASC' as const } } : {}),
      })
    ).map((row) => ({ ...row }));
  }
  async settings() {
    const row = await this.preferences.findOneBy({ id: 1 });
    return row ? { ...row } : null;
  }
  async latestAppliedRevision(controllerId: number) {
    const [row] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return row ? { ...row } : null;
  }
  async latestAppliedRevisions(controllerIds: number[]) {
    if (!controllerIds.length) return [];
    const rows = await this.revisions
      .createQueryBuilder('revision')
      .innerJoin(
        (query) =>
          query
            .subQuery()
            .select('latest.controllerId', 'controllerId')
            .addSelect('MAX(latest.revision)', 'revision')
            .from(WagoConfigurationRevision, 'latest')
            .where('latest.controllerId IN (:...controllerIds)', { controllerIds })
            .andWhere('latest.state = :state', { state: 'applied' })
            .groupBy('latest.controllerId'),
        'latest',
        'latest.controllerId = revision.controllerId AND latest.revision = revision.revision',
      )
      .where('revision.state = :state', { state: 'applied' })
      .getMany();
    return rows.map((row) => ({ ...row }));
  }
}

export class TypeormWagoDiagnosticsPersistence extends WagoDiagnosticsPersistence {
  constructor(
    private readonly controllerSource: () => Repository<WagoController>,
    private readonly draftSource: () => Repository<WagoConfigurationDraft>,
    private readonly revisionSource: () => Repository<WagoConfigurationRevision>,
    private readonly flowSource: () => Repository<ResourceFlowNode>,
    private readonly resourceSource: () => Repository<Resource>,
    private readonly sessionSource: () => Repository<WagoCommissioningSession>,
  ) {
    super();
  }
  private get controllers() {
    return this.controllerSource();
  }
  private get revisions() {
    return this.revisionSource();
  }
  private get nodes() {
    return this.flowSource();
  }
  async targetExists(kind: 'controller' | 'session', id: number) {
    return kind === 'session' ? this.sessionSource().existsBy({ id }) : this.controllers.existsBy({ id });
  }
  async controllerSnapshot(controllerId: number): Promise<WagoControllerDiagnosticSnapshot> {
    const controller = await this.controllers.findOneBy({ id: controllerId });
    if (!controller) return { controller: null, draft: null, latest: null, applied: null, nodes: [] };
    const [draft, latest, applied, nodes] = await Promise.all([
      this.draftSource().findOneBy({ controllerId }),
      this.revisions.findOne({ where: { controllerId }, order: { revision: 'DESC' } }),
      this.revisions.findOne({ where: { controllerId, state: 'applied' }, order: { revision: 'DESC' } }),
      this.nodes
        .createQueryBuilder('node')
        .where('node.type LIKE :type', { type: 'plugin.wago.%' })
        .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
        .take(1001)
        .getMany(),
    ]);
    return {
      controller: { ...controller },
      draft: draft ? { ...draft } : null,
      latest: latest ? { ...latest } : null,
      applied: applied ? { ...applied } : null,
      nodes: nodes.map((row) => ({ ...row })),
    };
  }
  async resourceNodes(resourceId: number) {
    return (
      await this.nodes
        .createQueryBuilder('node')
        .where('node.resourceId = :resourceId', { resourceId })
        .andWhere('node.type LIKE :type', { type: 'plugin.wago.%' })
        .orderBy('node.id', 'ASC')
        .take(1001)
        .getMany()
    ).map((row) => ({ ...row }));
  }
  async resourceDependencies(controllerIds: number[], channelIds: string[]) {
    const [controllers, appliedRevisions, conflictNodes] = await Promise.all([
      this.controllers
        .createQueryBuilder('controller')
        .select(['controller.id', 'controller.name', 'controller.hardwareId'])
        .where('controller.id IN (:...controllerIds)', { controllerIds })
        .getMany(),
      this.revisions
        .createQueryBuilder('revision')
        .select(['revision.controllerId', 'revision.revision', 'revision.snapshot'])
        .where('revision.controllerId IN (:...controllerIds)', { controllerIds })
        .andWhere('revision.state = :state', { state: 'applied' })
        .andWhere(
          'revision.revision = (SELECT MAX(applied.revision) FROM plugin_wago_configuration_revisions applied WHERE applied.controller_id = revision.controller_id AND applied.state = :state)',
        )
        .orderBy('revision.controllerId', 'ASC')
        .addOrderBy('revision.revision', 'DESC')
        .getMany(),
      channelIds.length
        ? this.nodes
            .createQueryBuilder('node')
            .where("node.data ->> 'controllerId' IN (:...controllerIds)", { controllerIds })
            .andWhere("node.data ->> 'channelId' IN (:...channelIds)", { channelIds })
            .andWhere('node.type = :type', { type: 'plugin.wago.command' })
            .take(1001)
            .getMany()
        : Promise.resolve([]),
    ]);
    return {
      controllers: controllers.map((row) => ({ ...row })),
      appliedRevisions: appliedRevisions.map((row) => ({ ...row })),
      conflictNodes: conflictNodes.map((row) => ({ ...row })),
    };
  }
  async resourceNames(ids: number[]) {
    if (!ids.length) return [];
    return (
      await this.resourceSource()
        .createQueryBuilder('resource')
        .select(['resource.id', 'resource.name'])
        .where('resource.id IN (:...ids)', { ids })
        .getMany()
    ).map(({ id, name }) => ({ id, name }));
  }
}

/** Composition and fixture helper; no engine object is returned to application code. */
export function createWagoDiagnosticsPersistence(
  context: Pick<LegacySqliteContext, 'getRepository' | 'dataSource'>,
): WagoDiagnosticsPersistence {
  return new TypeormWagoDiagnosticsPersistence(
    () => context.getRepository(WagoController),
    () => context.getRepository(WagoConfigurationDraft),
    () => context.getRepository(WagoConfigurationRevision),
    () => context.dataSource.getRepository<ResourceFlowNode>('ResourceFlowNode'),
    () => context.dataSource.getRepository<Resource>('Resource'),
    () => context.getRepository(WagoCommissioningSession),
  );
}
