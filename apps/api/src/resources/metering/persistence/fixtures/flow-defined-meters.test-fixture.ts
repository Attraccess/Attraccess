import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringSession,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { ResourceUsageService } from '../../../usage/sessions/resource-usage.service';
import { MeteringReport } from '../../../flows/node-executors';
import { ResourceMeteringService } from '../../resource-metering.service';
import { T } from './node-types.test-fixture';
import { schemas } from './schemas.test-fixture';
import { Handler } from './report-handler.test-fixture';
export function createFlowDefinedMeteringFixture() {
  let directory: string;

  let source: DataSource;

  let metering: ResourceMeteringService;

  let usage: ResourceUsageService;

  let users: User[];

  let log: string[];

  /** What the simulated meter does when its branches run; tests replace these. */
  let onStart: Handler;

  let onCollect: Handler;

  let startEffects: () => Promise<void>;

  let flows: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };

  let audit: { record: jest.Mock };

  let liveNotifications: { notifyTransactionUpdate: jest.Mock };

  const reading =
    (value: string, extra: Partial<Extract<MeteringReport, { kind: 'reading' }>> = {}): Handler =>
    ({ complete }) =>
      complete({ kind: 'reading', value, ...extra });

  const ready: Handler = ({ complete }) => complete({ kind: 'ready' });

  const correctionsOf = async (usageId: number) => {
    const original = await source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usageId });
    const corrections = await source.getRepository(BillingTransaction).find({ where: { correctionOfId: original.id } });
    const rows = await source.getRepository(BillingTransactionItem).find({
      where: corrections.map((correction) => ({ billingTransactionId: correction.id })),
    });
    return { original, corrections, items: rows };
  };

  const sessionOf = (usageId: number) => source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId });

  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
      {
        id: 'report',
        type: T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, value: '1' },
      },
    ]);
    await source.getRepository(ResourceFlowEdge).save([
      { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
      { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
    ]);
  }

  async function items(usageId: number) {
    const transaction = await source.getRepository(BillingTransaction).findOneByOrFail({ resourceUsageId: usageId });
    return {
      transaction,
      items: await source
        .getRepository(BillingTransactionItem)
        .find({ where: { billingTransactionId: transaction.id } }),
    };
  }

  const scope = {
    get directory() {
      return directory;
    },
    set directory(value: typeof directory) {
      directory = value;
    },
    get source() {
      return source;
    },
    set source(value: typeof source) {
      source = value;
    },
    get metering() {
      return metering;
    },
    set metering(value: typeof metering) {
      metering = value;
    },
    get usage() {
      return usage;
    },
    set usage(value: typeof usage) {
      usage = value;
    },
    get users() {
      return users;
    },
    set users(value: typeof users) {
      users = value;
    },
    get log() {
      return log;
    },
    set log(value: typeof log) {
      log = value;
    },
    get onStart() {
      return onStart;
    },
    set onStart(value: typeof onStart) {
      onStart = value;
    },
    get onCollect() {
      return onCollect;
    },
    set onCollect(value: typeof onCollect) {
      onCollect = value;
    },
    get startEffects() {
      return startEffects;
    },
    set startEffects(value: typeof startEffects) {
      startEffects = value;
    },
    get flows() {
      return flows;
    },
    set flows(value: typeof flows) {
      flows = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
    get liveNotifications() {
      return liveNotifications;
    },
    set liveNotifications(value: typeof liveNotifications) {
      liveNotifications = value;
    },
    get reading() {
      return reading;
    },
    get ready() {
      return ready;
    },
    get correctionsOf() {
      return correctionsOf;
    },
    get sessionOf() {
      return sessionOf;
    },
    get seedMeter() {
      return seedMeter;
    },
    get items() {
      return items;
    },
    get schemas() {
      return schemas;
    },
    get T() {
      return T;
    },
  };
  return scope;
}
