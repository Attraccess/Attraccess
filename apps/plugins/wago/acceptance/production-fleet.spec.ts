/* eslint-disable @nx/enforce-module-boundaries -- Acceptance deliberately connects the standalone runtime, plugin and real host graph executor. */
import 'reflect-metadata';
import { FleetAfterAll } from './production-fleet-afterall.test-utils';
import { FleetBeforeAll } from './production-fleet-beforeall.test-utils';
import { FleetFixtureState } from './production-fleet-fixture.test-utils';
import { base, delay, eventually, hardwareId, prefix, required } from './production-fleet-globals.test-utils';
import { registerAcquiresFractionalModbusPowerReadsThenAsynchronouslyWaitsInTheRealGraphAndWritesDo2 } from './production-fleet.acquires-fractional-modbus-power-reads-then-asynchronously-waits-in-the-real-graph-and-writes-do2.test-cases';
import { registerMarksUnchangedProductionSamplesStaleAndRefusesToSatisfyAWaitAfterTheirFreshnessWindow } from './production-fleet.marks-unchanged-production-samples-stale-and-refuses-to-satisfy-a-wait-after-their-freshness-window.test-cases';
import { registerRejectsCapturedDuplicateOutOfOrderTelemetryAndDeduplicatesAnActualCommandWithoutRewriti } from './production-fleet.rejects-captured-duplicate-out-of-order-telemetry-and-deduplicates-an-actual-command-without-rewriti.test-cases';
import { registerRejectsSCommandsOnTheRealRuntimeWithoutChangingPackedOutput } from './production-fleet.rejects-s-commands-on-the-real-runtime-without-changing-packed-output.test-cases';
import { registerRoutesCanonicalDi1ThroughTheProductionGraphAndWaitsForTheCorrelatedProductionAcknowledg } from './production-fleet.routes-canonical-di1-through-the-production-graph-and-waits-for-the-correlated-production-acknowledg.test-cases';

describe('production fleet acceptance — RabbitMQ / packed-register / Modbus TCP fixtures, NOT hardware qualification', () => {
  defineProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTests();
});

export function defineProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTests() {
  const state = new FleetFixtureState();
  beforeAll(() => FleetBeforeAll(state));

  afterAll(() => FleetAfterAll(state));
  const scope = {
    get graph() {
      return state.graph;
    },
    get holdAcknowledgement() {
      return state.holdAcknowledgement;
    },
    set holdAcknowledgement(value: typeof state.holdAcknowledgement) {
      state.holdAcknowledgement = value;
    },
    get din() {
      return state.din;
    },
    get runtime() {
      return state.runtime;
    },
    set runtime(value: typeof state.runtime) {
      state.runtime = value;
    },
    eventually,
    get heldAcknowledgement() {
      return state.heldAcknowledgement;
    },
    set heldAcknowledgement(value: typeof state.heldAcknowledgement) {
      state.heldAcknowledgement = value;
    },
    required,
    get wire() {
      return state.wire;
    },
    get dout() {
      return state.dout;
    },
    get completed() {
      return state.completed;
    },
    get observer() {
      return state.observer;
    },
    set observer(value: typeof state.observer) {
      state.observer = value;
    },
    get base() {
      return base;
    },
    get processedAcknowledgements() {
      return state.processedAcknowledgements;
    },
    get prefix() {
      return prefix;
    },
    get hardwareId() {
      return hardwareId;
    },
    get snapshot() {
      return state.snapshot;
    },
    set snapshot(value: typeof state.snapshot) {
      state.snapshot = value;
    },
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
    get errors() {
      return state.errors;
    },
    get modbusRaw() {
      return state.modbusRaw;
    },
    set modbusRaw(value: typeof state.modbusRaw) {
      state.modbusRaw = value;
    },
    get delay() {
      return delay;
    },
    get modbusRequests() {
      return state.modbusRequests;
    },
    get flow() {
      return state.flow;
    },
    set flow(value: typeof state.flow) {
      state.flow = value;
    },
    get query() {
      return state.query;
    },
    get logs() {
      return state.logs;
    },
    get warnings() {
      return state.warnings;
    },
    get statePath() {
      return state.statePath;
    },
  };

  registerRoutesCanonicalDi1ThroughTheProductionGraphAndWaitsForTheCorrelatedProductionAcknowledg(scope);

  registerAcquiresFractionalModbusPowerReadsThenAsynchronouslyWaitsInTheRealGraphAndWritesDo2(scope);

  registerRejectsCapturedDuplicateOutOfOrderTelemetryAndDeduplicatesAnActualCommandWithoutRewriti(scope);

  registerRejectsSCommandsOnTheRealRuntimeWithoutChangingPackedOutput(scope);

  registerMarksUnchangedProductionSamplesStaleAndRefusesToSatisfyAWaitAfterTheirFreshnessWindow(scope);

  return scope;
}

export type ProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTestScope =
  ReturnType<
    typeof defineProductionFleetAcceptanceRabbitMqPackedRegisterModbusTcpFixturesNotHardwareQualificationTests
  >;
