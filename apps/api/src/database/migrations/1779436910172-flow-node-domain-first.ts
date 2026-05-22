import { MigrationInterface, QueryRunner } from 'typeorm';

export const OLD_TO_NEW: Record<string, string> = {
  'input.button':                                              'manual.button',
  'input.resource.usage.started':                              'resource.usage.started',
  'input.resource.usage.stopped':                              'resource.usage.stopped',
  'input.resource.usage.takeover':                             'resource.usage.takeover',
  'output.resource.usage.end-session':                         'resource.usage.end-session',
  'input.resource.activity.no-activity':                       'resource.activity.no-activity',
  'output.resource.activity.track-activity':                   'resource.activity.track-activity',
  'output.resource.billing.calculation.set-additional-items':  'resource.billing.set-additional-items',
  'input.resource.door.unlocked':                              'door.unlocked',
  'input.resource.door.locked':                                'door.locked',
  'input.resource.door.unlatched':                             'door.unlatched',
  'input.mqtt.message.received':                               'mqtt.message.received',
  'output.mqtt.sendMessage':                                   'mqtt.send-message',
  'processing.mqtt.waitForMessage':                            'mqtt.wait-for-message',
  'output.http.sendRequest':                                   'http.send-request',
  'processing.wait':                                           'logic.wait',
  'processing.if':                                             'logic.if',
  'processing.set-payload':                                    'logic.set-payload',
  'processing.error':                                          'logic.error',
  'output.resource.health.heartbeat':                          'health.heartbeat',
  'output.resource.health.set':                                'health.set',
};

export const NEW_TO_OLD: Record<string, string> = Object.fromEntries(
  Object.entries(OLD_TO_NEW).map(([oldType, newType]) => [newType, oldType]),
);

const NEW_CHECK = Object.values(OLD_TO_NEW).map((v) => `'${v}'`).join(',');
const OLD_CHECK = Object.keys(OLD_TO_NEW).map((v) => `'${v}'`).join(',');
const FK_NODE_RESOURCE = 'FK_ca3080b2dbc9c7c88a4a64c469d';

function escape(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

export class FlowNodeDomainFirst1779436910172 implements MigrationInterface {
  name = 'FlowNodeDomainFirst1779436910172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rewrite(queryRunner, OLD_TO_NEW, NEW_CHECK);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rewrite(queryRunner, NEW_TO_OLD, OLD_CHECK);
  }

  private async rewrite(
    queryRunner: QueryRunner,
    map: Record<string, string>,
    check: string,
  ): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN (${check}) ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "${FK_NODE_RESOURCE}" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );

    const nodes: Array<{
      id: string;
      type: string;
      data: unknown;
      createdAt: string;
      updatedAt: string;
      resourceId: number;
      positionX: number;
      positionY: number;
    }> = await queryRunner.query(`SELECT * FROM "resource_flow_node"`);

    if (nodes.length > 0) {
      const rewritten = nodes.map((node) => {
        const next = map[node.type];
        if (!next) {
          throw new Error(`FlowNodeDomainFirst: unknown node type "${node.type}" in row ${node.id}`);
        }
        return { ...node, type: next };
      });

      const values = rewritten
        .map(
          (n) =>
            `(${escape(n.id)}, ${escape(n.type)}, ${escape(typeof n.data === 'string' ? n.data : JSON.stringify(n.data))}, ${escape(n.createdAt)}, ${escape(n.updatedAt)}, ${escape(n.resourceId)}, ${escape(n.positionX)}, ${escape(n.positionY)})`,
        )
        .join(',');

      await queryRunner.query(
        `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") VALUES ${values}`,
      );
    }

    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }
}
