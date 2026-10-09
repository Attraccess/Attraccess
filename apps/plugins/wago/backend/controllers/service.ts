import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PluginContext } from '@attraccess/plugins-backend-sdk';

import { PLUGIN_CONTEXT, ENROLLMENT_RETRY_MS, STALE_AFTER_MS, MAX_PENDING_CONFIGURATION_REPORTS } from './model';

import { WagoController } from './entity';

import { WagoEnrollment } from './enrollment.entity';

import { hash, safeEqual, isClaimAcknowledgement } from './model';

import { WagoConfigurationRevision } from '../configuration/revision.entity';

import { WagoControllerSummary } from './model';

import { freshness } from '../diagnostics/store';

import {
  CONFIGURATION_PROTOCOL_VERSION,
  compatibilityError,
  configurationDesiredTopic,
  discoveryTopic,
} from '../protocol/index';

import { parseConfigurationReport } from '../configuration/model';

import { WagoSubscriptions } from './subscriptions';

export { WagoCredentialOperationUncertainError } from './model';

@Injectable()
export class WagoService extends WagoSubscriptions implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(@Inject(PLUGIN_CONTEXT) context: PluginContext) {
    super(context);
  }

  protected scheduleSubscriptionRetry(): void {
    if (this.destroyed || this.subscriptionRetryTimer) return;
    this.subscriptionRetryTimer = setTimeout(() => {
      this.subscriptionRetryTimer = null;
      if (this.destroyed) return;
      void this.subscribeConfiguredServers().catch((error) => {
        this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions: ${String(error)}`);
        this.scheduleSubscriptionRetry();
      });
    }, ENROLLMENT_RETRY_MS);
  }

  protected async withConfigurationLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.configurationLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.configurationLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.configurationLocks.get(id) === lock) this.configurationLocks.delete(id);
    }
  }

  protected async claimedController(id: number): Promise<WagoController> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller || controller.trustState !== 'claimed')
      throw new NotFoundException(`claimed WAGO controller ${id} not found`);
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${id} has no MQTT server`);
    return controller;
  }

  protected async withClaimConfigurationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.claimConfigurationLock;
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimConfigurationLock = lock;
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimConfigurationLock === lock) this.claimConfigurationLock = Promise.resolve();
    }
  }

  protected async withClaimLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.claimLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimLocks.get(id) === lock) this.claimLocks.delete(id);
    }
  }

  protected clearClaimAcknowledgement(enrollmentId: number): void {
    this.claimAcknowledgementSubscriptions.get(enrollmentId)?.unsubscribe();
    this.claimAcknowledgementSubscriptions.delete(enrollmentId);
  }

  protected async revokeEnrollment(
    enrollment: WagoEnrollment,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    if (!enrollment.revokedAt) {
      await assertOwned();
      const manual = await this.context.getMqttCredentialProvisioning().revoke({
        mqttServerId: enrollment.mqttServerId,
        identity: enrollment.identity,
        username: enrollment.identity,
        vhost: '/',
      });
      if (manual)
        throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
      await assertOwned();
      enrollment.revokedAt = new Date().toISOString();
      await this.enrollments.save(enrollment);
    }
    await assertOwned();
    enrollment.consumedAt = new Date().toISOString();
    await this.enrollments.save(enrollment);
    const timer = this.enrollmentExpiryTimers.get(enrollment.id);
    if (timer) clearTimeout(timer);
    this.enrollmentExpiryTimers.delete(enrollment.id);
    this.clearClaimAcknowledgement(enrollment.id);
  }

  protected scheduleEnrollmentExpiry(
    enrollment: WagoEnrollment,
    delay = Date.parse(enrollment.expiresAt) - Date.now(),
  ): void {
    if (enrollment.consumedAt) return;
    const existing = this.enrollmentExpiryTimers.get(enrollment.id);
    if (existing) clearTimeout(existing);
    this.enrollmentExpiryTimers.set(
      enrollment.id,
      setTimeout(
        () => {
          this.enrollmentExpiryTimers.delete(enrollment.id);
          if (this.destroyed) return;
          void this.revokeEnrollment(enrollment)
            .then(() => this.subscribeConfiguredServers())
            .catch((error) => {
              this.context.logger.warn(`Could not revoke expired WAGO enrollment ${enrollment.id}: ${String(error)}`);
              if (!enrollment.consumedAt) this.scheduleEnrollmentExpiry(enrollment, ENROLLMENT_RETRY_MS);
              this.scheduleSubscriptionRetry();
            });
        },
        Math.max(0, delay),
      ),
    );
  }

  protected isActiveEnrollment(enrollment: WagoEnrollment): boolean {
    return !enrollment.consumedAt && !enrollment.revokedAt && Date.parse(enrollment.expiresAt) > Date.now();
  }

  protected activeEnrollments(): Promise<WagoEnrollment[]> {
    return this.enrollments
      .createQueryBuilder('enrollment')
      .where('enrollment.consumedAt IS NULL')
      .andWhere('enrollment.revokedAt IS NULL')
      .andWhere('enrollment.expiresAt > :now', { now: new Date().toISOString() })
      .getMany();
  }

  protected async activeEnrollment(id: number | null): Promise<WagoEnrollment | null> {
    if (!id) return null;
    const enrollment = await this.enrollments.findOneBy({ id });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }

  protected async validEnrollment(
    secret: string,
    serverId: number,
    hardwareId: string,
  ): Promise<WagoEnrollment | null> {
    const enrollment = await this.enrollments.findOneBy({
      secretHash: hash(secret),
      mqttServerId: serverId,
      hardwareId,
    });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }

  protected matchesVerifier(controller: WagoController, verifier: string): boolean {
    const value = verifier.trim();
    return (
      (Boolean(value) && Boolean(controller.fingerprint) && safeEqual(hash(value), hash(controller.fingerprint))) ||
      safeEqual(hash(value), controller.pairingCodeHash)
    );
  }

  protected async appliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return revision ?? null;
  }

  protected connectivity(controller: WagoController): WagoControllerSummary['connectivity'] {
    if (controller.trustState === 'untrusted') return 'untrusted';
    const heartbeatAt = this.diagnostics.read(controller.id).heartbeatAt ?? controller.lastHeartbeatAt;
    if (freshness(heartbeatAt, Date.now(), STALE_AFTER_MS) !== 'fresh') return 'stale';
    if (this.isRuntimeUpdateRequired(controller.id)) {
      const policy = this.runtimePolicies.get(controller.id);
      return policy?.observed && policy.desired !== policy.observed ? 'runtime_update' : 'runtime_check';
    }
    return 'online';
  }

  protected async publishRevision(
    controller: WagoController,
    revision: WagoConfigurationRevision,
  ): Promise<WagoConfigurationRevision> {
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${controller.id} has no MQTT server`);
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
    const settings = await this.getSettings();
    const runtimePolicy = this.runtimePolicies.get(controller.id);
    await this.context.mqtt.publish(
      controller.mqttServerId,
      configurationDesiredTopic(settings.operationalPrefix ?? 'attraccess/wago', controller.hardwareId),
      JSON.stringify({
        protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
        ...(runtimePolicy
          ? {
              runtimeImageId: runtimePolicy.desired,
              runtimePolicyToken: runtimePolicy.runtimePolicyToken,
            }
          : {}),
        revision: revision.revision,
        contentHash: revision.contentHash,
        snapshot: JSON.parse(revision.snapshot),
      }),
      { qos: 1, retain: true },
    );
    revision.state = 'published';
    return this.revisions.save(revision);
  }

  protected configurationReportRevision(payload: Buffer): number | null {
    try {
      const report = JSON.parse(payload.toString('utf8')) as { revision?: unknown };
      return Number.isSafeInteger(report.revision) && (report.revision as number) >= 1
        ? (report.revision as number)
        : null;
    } catch {
      return null;
    }
  }

  protected async processConfigurationReports(
    controllerId: number,
    payload: Buffer,
    queue: { pending: Map<number, Buffer>; processing: boolean },
  ): Promise<void> {
    let next: Buffer | null = payload;
    while (next) {
      try {
        await this.onConfigurationReported(controllerId, next);
      } catch (error) {
        this.context.logger.warn(`Could not process WAGO configuration report: ${String(error)}`);
      }
      const pending = queue.pending.entries().next();
      if (pending.done) next = null;
      else {
        const [revision, report] = pending.value;
        queue.pending.delete(revision);
        next = report;
      }
    }
    queue.processing = false;
    if (this.configurationReportQueues.get(controllerId) === queue) this.configurationReportQueues.delete(controllerId);
  }

  protected enqueueConfigurationReport(controllerId: number, payload: Buffer): void {
    const queue = this.configurationReportQueues.get(controllerId) ?? { pending: new Map(), processing: false };
    this.configurationReportQueues.set(controllerId, queue);
    if (queue.processing) {
      // Preserve acknowledgements for distinct immutable revisions in arrival order.
      const revision = this.configurationReportRevision(payload);
      const key = revision ?? Number.NaN;
      if (queue.pending.has(key) || queue.pending.size < MAX_PENDING_CONFIGURATION_REPORTS)
        queue.pending.set(key, payload);
      else this.context.logger.warn(`Dropping excess WAGO configuration report for controller ${controllerId}`);
      return;
    }
    queue.processing = true;
    void this.processConfigurationReports(controllerId, payload, queue);
  }

  protected onCommandAcknowledgement(controllerId: number, payload: Buffer): void {
    this.commands.acknowledge(controllerId, payload);
  }

  protected async onConfigurationReported(controllerId: number, payload: Buffer): Promise<void> {
    let report: ReturnType<typeof parseConfigurationReport>;
    try {
      report = parseConfigurationReport(JSON.parse(payload.toString('utf8')));
    } catch {
      this.context.logger.warn(`Ignoring invalid WAGO configuration report for controller ${controllerId}`);
      return;
    }
    if (!report) {
      this.context.logger.warn(`Ignoring malformed WAGO configuration report for controller ${controllerId}`);
      return;
    }
    await this.withConfigurationLock(controllerId, async () => {
      const revision = await this.revisions.findOneBy({ controllerId, revision: report.revision });
      if (!revision || revision.contentHash !== report.contentHash) return;
      if (revision.state !== 'published') return;
      revision.state = report.errors.length ? 'rejected' : 'applied';
      revision.rejectionErrors = report.errors.length ? JSON.stringify(report.errors) : null;
      revision.reportedAt = new Date().toISOString();
      await this.revisions.save(revision);
    });
  }

  protected async watchClaimAcknowledgement(
    prepared: {
      controller: WagoController;
      enrollment: WagoEnrollment;
      mqttServerId: number;
      credentialDelivered?: boolean;
    },
    acknowledgementToken: string,
    manual?: { acknowledged: () => void; assertOwned: () => Promise<void> },
  ): Promise<void> {
    const topic = `${discoveryTopic(prepared.controller.hardwareId)}/claim/ack`;
    const subscription = await this.subscribeMqtt(prepared.mqttServerId, topic, async (message) => {
      if (!isClaimAcknowledgement(message.payload, acknowledgementToken)) return;
      if (
        manual &&
        !(await manual.assertOwned().then(
          () => true,
          () => false,
        ))
      )
        return;
      prepared.credentialDelivered = true;
      this.clearClaimAcknowledgement(prepared.enrollment.id);
      try {
        await this.revokeEnrollment(prepared.enrollment, manual?.assertOwned);
      } catch (error) {
        this.context.logger.warn(
          `Could not revoke acknowledged WAGO enrollment ${prepared.enrollment.id}: ${String(error)}`,
        );
      }
      if (
        manual &&
        (await manual.assertOwned().then(
          () => true,
          () => false,
        ))
      )
        manual.acknowledged();
    });
    if (
      manual &&
      !(await manual.assertOwned().then(
        () => true,
        () => false,
      ))
    ) {
      subscription.unsubscribe();
      return;
    }
    this.claimAcknowledgementSubscriptions.set(prepared.enrollment.id, subscription);
  }
}
