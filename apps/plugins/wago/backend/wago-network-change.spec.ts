import { DataSource } from 'typeorm';
import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoNetworkChangeService, networkChangeInput } from './wago-network-change.service';

import { WagoDeviceOperation } from './wago-managed-access.entity';

import { WagoManagedRuntimeService } from './wago-managed-runtime.service';

import { managedSsh } from './wago-managed-ssh';

import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { WagoDeviceOperations } from './wago-device-operations';
import { registerChangesOnlyTheStoredAddressUsingNewIpSshWithoutTheOldIpBrokerHeartbeatOrCredentials } from './wago-network-change.changes-only-the-stored-address-using-new-ip-ssh-without-the-old-ip-broker-heartbeat-or-credentials.test-cases';
import { registerRejectsAnOlderHostBeforeChangingBrokerCredentialsWhenSharedConnectionRefreshIsUnavailab } from './wago-network-change.rejects-an-older-host-before-changing-broker-credentials-when-shared-connection-refresh-is-unavailab.test-cases';
import { registerRefreshesTheSameServerOrMigratesBrokerIUsingDeviceCredentialsAndConsistentAssociations } from './wago-network-change.refreshes-the-same-server-or-migrates-broker-i-using-device-credentials-and-consistent-associations.test-cases';
import { registerRejectsADifferentPinnedSshHostKeyBeforeProvisioningOrStoringANewAddress } from './wago-network-change.rejects-a-different-pinned-ssh-host-key-before-provisioning-or-storing-a-new-address.test-cases';
import { registerRecoversInterruptedApplyAfterProcessRestartWithTheExactSavedCredentials } from './wago-network-change.recovers-interrupted-apply-after-process-restart-with-the-exact-saved-credentials.test-cases';
import { registerRefreshesCorrectedBrokerSettingsAfterFailedVerificationAndRetainsTheReplacementAcrossInt } from './wago-network-change.refreshes-corrected-broker-settings-after-failed-verification-and-retains-the-replacement-across-int.test-cases';
import { registerRecoversAnAmbiguousAcknowledgementAfterAtomicAddressAndBrokerCommit } from './wago-network-change.recovers-an-ambiguous-acknowledgement-after-atomic-address-and-broker-commit.test-cases';
import { registerKeepsPendingChangesExclusiveAfterInterruptionIncludingANewCommissioningSessionWithOnlyT } from './wago-network-change.keeps-pending-changes-exclusive-after-interruption-including-a-new-commissioning-session-with-only-t.test-cases';
import { registerRejectsStaleOrWrongBrokerEvidenceAndDoesNotCommitBeforeTheAuthenticatedDeviceAcknowled } from './wago-network-change.rejects-stale-or-wrong-broker-evidence-and-does-not-commit-before-the-authenticated-device-acknowled.test-cases';
import { registerKeepsPreviousBrokerCleanupRetryableAndDoesNotHideTheSuccessfulMigration } from './wago-network-change.keeps-previous-broker-cleanup-retryable-and-does-not-hide-the-successful-migration.test-cases';
import { registerClearsRedundantBrokerAliasesWithoutRevokingTheActiveCredentials } from './wago-network-change.clears-redundant-broker-aliases-without-revoking-the-active-credentials.test-cases';
import { registerRetainsCleanupWhenBrokerDnsAddressSetsOnlyPartiallyOverlap } from './wago-network-change.retains-cleanup-when-broker-dns-address-sets-only-partially-overlap.test-cases';
import { registerClearsAliasesWithEquivalentDnsAddressSetsRegardlessOfOrderOrMappedIpv4Notation } from './wago-network-change.clears-aliases-with-equivalent-dns-address-sets-regardless-of-order-or-mapped-ipv4-notation.test-cases';
import { registerClearsDuplicateBrokerHostnamesWithoutRequiringDnsOrRevokingCredentials } from './wago-network-change.clears-duplicate-broker-hostnames-without-requiring-dns-or-revoking-credentials.test-cases';
import { registerRetainsAmbiguousSharedHostRetirementsForDifferentBrokerListeners } from './wago-network-change.retains-ambiguous-shared-host-retirements-for-different-broker-listeners.test-cases';
import { registerKeepsOldCredentialRetirementAvailableAfterSshManagementHasBeenRetired } from './wago-network-change.keeps-old-credential-retirement-available-after-ssh-management-has-been-retired.test-cases';
import { registerMigratesRecoveryStorageAndRefusesToDiscardPendingDeviceChangesOrPreviousBrokerIdentitie } from './wago-network-change.migrates-recovery-storage-and-refuses-to-discard-pending-device-changes-or-previous-broker-identitie.test-cases';
import { resetTestFixture } from './wago-network-change.setup.test-fixture';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ managedSsh: jest.fn() }));
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const artifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
} as BuildRuntimeArtifact;
const principal = { userId: 7, authenticationMethod: 'session' as const };
const oldHost = '10.77.0.7',
  newHost = '192.168.2.50',
  fingerprint = `SHA256:${'a'.repeat(43)}`;

describe('SSH MQTT/address changes with disconnected previous destinations', () => {
  defineSshMqttAddressChangesWithDisconnectedPreviousDestinationsTests();
});

export function defineSshMqttAddressChangesWithDisconnectedPreviousDestinationsTests() {
  let db: DataSource, managed: WagoManagedRuntimeService, service: WagoNetworkChangeService, context: PluginContext;
  let listener: (message: PluginMqttMessage) => void,
    payloads: Buffer[],
    provision: jest.Mock,
    audit: jest.Mock,
    revoke: jest.Mock;
  let failure: 'host_identity' | 'apply' | 'ack' | null, allowEvidence: boolean, brokerHost: string;
  let wago: {
    getSettings: jest.Mock;
    registerRuntimeStatusHandler: jest.Mock;
    blockRuntime: jest.Mock;
    refreshNetworkConnection: jest.Mock;
  };
  beforeEach(async () => {
    await resetTestFixture(scope);
  });
  afterEach(async () => {
    await managed.onModuleDestroy();
    await db.destroy();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  const scope = {
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get newHost() {
      return newHost;
    },
    get principal() {
      return principal;
    },
    get provision() {
      return provision;
    },
    set provision(value: typeof provision) {
      provision = value;
    },
    get context() {
      return context;
    },
    set context(value: typeof context) {
      context = value;
    },
    get wago() {
      return wago;
    },
    set wago(value: typeof wago) {
      wago = value;
    },
    get payloads() {
      return payloads;
    },
    set payloads(value: typeof payloads) {
      payloads = value;
    },
    get fingerprint() {
      return fingerprint;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get oldHost() {
      return oldHost;
    },
    get brokerHost() {
      return brokerHost;
    },
    set brokerHost(value: typeof brokerHost) {
      brokerHost = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
    get revoke() {
      return revoke;
    },
    set revoke(value: typeof revoke) {
      revoke = value;
    },
    get failure() {
      return failure;
    },
    set failure(value: typeof failure) {
      failure = value;
    },
    get managed() {
      return managed;
    },
    set managed(value: typeof managed) {
      managed = value;
    },
    get allowEvidence() {
      return allowEvidence;
    },
    set allowEvidence(value: typeof allowEvidence) {
      allowEvidence = value;
    },
    get listener() {
      return listener;
    },
    set listener(value: typeof listener) {
      listener = value;
    },
    get artifact() {
      return artifact;
    },
  };

  registerChangesOnlyTheStoredAddressUsingNewIpSshWithoutTheOldIpBrokerHeartbeatOrCredentials(scope);

  registerRejectsAnOlderHostBeforeChangingBrokerCredentialsWhenSharedConnectionRefreshIsUnavailab(scope);

  registerRefreshesTheSameServerOrMigratesBrokerIUsingDeviceCredentialsAndConsistentAssociations(scope);

  registerRejectsADifferentPinnedSshHostKeyBeforeProvisioningOrStoringANewAddress(scope);

  registerRecoversInterruptedApplyAfterProcessRestartWithTheExactSavedCredentials(scope);

  registerRefreshesCorrectedBrokerSettingsAfterFailedVerificationAndRetainsTheReplacementAcrossInt(scope);

  registerRecoversAnAmbiguousAcknowledgementAfterAtomicAddressAndBrokerCommit(scope);

  it('excludes commissioning, updates, rotation and recovery using the shared device lease', async () => {
    const operations = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    await operations.acquire(fingerprint, 'other-operation', Date.now(), Date.now() + 60000);
    await expect(service.apply(1, { targetHost: newHost, mqttServerId: 2 }, principal)).rejects.toThrow('active');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
  });

  registerKeepsPendingChangesExclusiveAfterInterruptionIncludingANewCommissioningSessionWithOnlyT(scope);

  registerRejectsStaleOrWrongBrokerEvidenceAndDoesNotCommitBeforeTheAuthenticatedDeviceAcknowled(scope);

  registerKeepsPreviousBrokerCleanupRetryableAndDoesNotHideTheSuccessfulMigration(scope);

  registerClearsRedundantBrokerAliasesWithoutRevokingTheActiveCredentials(scope);

  registerRetainsCleanupWhenBrokerDnsAddressSetsOnlyPartiallyOverlap(scope);

  registerClearsAliasesWithEquivalentDnsAddressSetsRegardlessOfOrderOrMappedIpv4Notation(scope);

  registerClearsDuplicateBrokerHostnamesWithoutRequiringDnsOrRevokingCredentials(scope);

  registerRetainsAmbiguousSharedHostRetirementsForDifferentBrokerListeners(scope);

  registerKeepsOldCredentialRetirementAvailableAfterSshManagementHasBeenRetired(scope);

  return scope;
}

export type SshMqttAddressChangesWithDisconnectedPreviousDestinationsTestScope = ReturnType<
  typeof defineSshMqttAddressChangesWithDisconnectedPreviousDestinationsTests
>;
defineRootTestRegistrationsTests();

export function defineRootTestRegistrationsTests() {
  it.each(['192.168.1.10;reboot', '127.0.0.1', '8.8.8.8', '10.0.0.999', '10.0.00.1', '-oProxyCommand=sh'])(
    'rejects unsafe SSH target %s',
    (targetHost) => {
      expect(() => networkChangeInput({ targetHost, mqttServerId: 1 })).toThrow();
    },
  );
  const scope = {
    get fingerprint() {
      return fingerprint;
    },
    get newHost() {
      return newHost;
    },
  };

  registerMigratesRecoveryStorageAndRefusesToDiscardPendingDeviceChangesOrPreviousBrokerIdentitie(scope);

  return scope;
}

export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;
