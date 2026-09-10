import {
  Alert,
  Button,
  Checkbox,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { AlertCircleIcon, CheckCircle2Icon, CpuIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommissioningSession } from './api';
import { getCommissioningVerification } from './api';
import { CommissioningSecurityPanel } from './CommissioningSecurityPanel';
import { useQuery } from '@tanstack/react-query';
import { commissioningLabel } from './ControllersTable';
import { StandardDrawer } from './drawer';
import {
  useCommissioningSessionsQuery,
  useConfirmCommissioningHostKeyMutation,
  useCreateCommissioningSessionMutation,
  useDeliverCommissioningSessionMutation,
  useMqttServersQuery,
  useRemoveCommissioningSessionMutation,
  useSettingsQuery,
} from './queries';

interface CommissioningModalProps {
  isOpen: boolean;
  session: CommissioningSession | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfigure?: (controllerId: number) => void;
}

export function CommissioningModal({
  isOpen,
  session: resumedSession,
  onOpenChange,
  onConfigure,
}: CommissioningModalProps) {
  const createSessionMutation = useCreateCommissioningSessionMutation();
  const confirmHostKeyMutation = useConfirmCommissioningHostKeyMutation();
  const deliverSessionMutation = useDeliverCommissioningSessionMutation();
  const removeSessionMutation = useRemoveCommissioningSessionMutation();
  const settingsQuery = useSettingsQuery();
  const mqttServersQuery = useMqttServersQuery();
  const commissioningSessionsQuery = useCommissioningSessionsQuery();
  const [createdSession, setCreatedSession] = useState<CommissioningSession | null>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [controllerIp, setControllerIp] = useState('');
  const [mqttServerId, setMqttServerId] = useState<Key | null>(null);
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState('');
  const [isolatedIdentity, setIsolatedIdentity] = useState(false);
  useEffect(() => {
    setIsolatedIdentity(false);
    setHostKeyFingerprint('');
  }, [resumedSession?.id, isOpen]);
  const [sshUsername, setSshUsername] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [useCustomSshCredentials, setUseCustomSshCredentials] = useState(false);
  const [confirmInstall, setConfirmInstall] = useState(false);
  const [isCancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);

  const attemptSession = deliverSessionMutation.data;
  const mutationSession =
    (attemptSession && (!resumedSession || attemptSession.id === resumedSession.id) ? attemptSession : null) ??
    resumedSession ??
    createdSession;
  const session = mutationSession
    ? (commissioningSessionsQuery.data?.find((candidate) => candidate.id === mutationSession.id) ?? mutationSession)
    : null;
  const selectedMqttServerId = mqttServerId === null ? null : Number(mqttServerId);
  const isLoading =
    createSessionMutation.isPending ||
    confirmHostKeyMutation.isPending ||
    deliverSessionMutation.isPending ||
    removeSessionMutation.isPending;
  const loadingStatus = createSessionMutation.isPending
    ? [
        'Preparing commissioning',
        'Scanning the SSH key for your review. A scan alone does not authenticate the controller.',
      ]
    : removeSessionMutation.isPending
      ? ['Canceling enrollment', 'Revoking access and removing the enrollment records.']
      : confirmHostKeyMutation.isPending
        ? ['Confirming controller identity', 'Saving the administrator-confirmed SSH host key.']
        : null;

  useEffect(() => {
    setSshPassword('');
    setSshUsername('');
    setUseCustomSshCredentials(false);
    setConfirmInstall(false);
    setHostKeyFingerprint('');
    setIsolatedIdentity(false);
  }, [isOpen, resumedSession?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setMqttServerId(
      resumedSession?.mqttServerId.toString() ?? settingsQuery.data?.defaultMqttServerId?.toString() ?? null,
    );
    setName(resumedSession?.controllerName ?? '');
    setControllerIp(resumedSession?.targetHost ?? '');
    setStep(sessionStep(resumedSession));
  }, [isOpen, resumedSession, settingsQuery.data?.defaultMqttServerId]);

  function close() {
    setCreatedSession(null);
    setStep(0);
    setName('');
    setControllerIp('');
    setMqttServerId(null);
    setHostKeyFingerprint('');
    setSshUsername('');
    setSshPassword('');
    setUseCustomSshCredentials(false);
    setConfirmInstall(false);
    setCancelConfirmationOpen(false);
    createSessionMutation.reset();
    confirmHostKeyMutation.reset();
    confirmHostKeyMutation.reset();
    deliverSessionMutation.reset();
    removeSessionMutation.reset();
    onOpenChange(false);
  }

  function createSession() {
    if (selectedMqttServerId === null) return;
    createSessionMutation.mutate(
      {
        name,
        targetHost: controllerIp,
        mqttServerId: selectedMqttServerId,
      },
      {
        onSuccess: (created) => {
          setCreatedSession(created);
          setStep(2);
        },
      },
    );
  }

  function deliverSession() {
    if (
      !session ||
      isLoading ||
      (session.state !== 'delivery_failed' && !confirmInstall) ||
      (session.state !== 'delivery_failed' && useCustomSshCredentials && (!sshUsername.trim() || !sshPassword)) ||
      !canInstall(session)
    )
      return;
    deliverSessionMutation.mutate({
      id: session.id,
      confirmInstall: true,
      ...(session.state !== 'delivery_failed' && useCustomSshCredentials
        ? { temporarySsh: { username: sshUsername.trim(), password: sshPassword } }
        : {}),
    });
    setSshUsername('');
    setSshPassword('');
    setConfirmInstall(false);
  }

  function confirmHostKey() {
    if (!session) return;
    confirmHostKeyMutation.mutate({
      id: session.id,
      hostKeyFingerprint: isolatedIdentity ? session.hostKeyFingerprint : hostKeyFingerprint,
      physicalIdentityConfirmed: isolatedIdentity,
    });
  }

  function configureController(controllerId: number) {
    close();
    onConfigure?.(controllerId);
  }

  const activeStep = session ? sessionStep(session) : step;
  const title = session?.controllerName || name || 'New CC100 controller';

  return (
    <StandardDrawer ariaLabel="Commission a controller" isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <DrawerHeader>
        <h2 className="wg:text-xl wg:font-semibold">Commission a controller</h2>
      </DrawerHeader>
      <DrawerBody>
        <div className="wg:grid wg:min-w-0 wg:gap-5 wg:md:grid-cols-[13rem_minmax(0,1fr)]">
          <DevicePassport className="wg:hidden wg:md:block" name={title} step={activeStep} />
          <div className="wg:min-w-0 wg:space-y-5">
            <StepHeading step={activeStep} />
            {loadingStatus && <OperationStatus title={loadingStatus[0]} description={loadingStatus[1]} />}
            {!session && activeStep === 0 && <NameStep name={name} onNameChange={setName} />}
            {!session && activeStep === 1 && (
              <ConnectionStep
                controllerIp={controllerIp}
                mqttServerId={mqttServerId}
                mqttServersQuery={mqttServersQuery}
                onControllerIpChange={setControllerIp}
                onMqttServerIdChange={setMqttServerId}
              />
            )}
            {session?.state === 'awaiting_identity_confirmation' && (
              <HostKeyConfirmationStep
                fingerprint={hostKeyFingerprint}
                expectedFingerprint={session.hostKeyFingerprint}
                onFingerprintChange={setHostKeyFingerprint}
              />
            )}
            {session?.state === 'awaiting_identity_confirmation' && (
              <Checkbox isSelected={isolatedIdentity} onChange={setIsolatedIdentity}>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  Alternatively, I verified the physical 751-9301 label and connected this controller as the only device
                  on an isolated service network. I accept first-key pinning on that connection, not independent
                  cryptographic identity verification. Do not select this on a shared LAN.
                </Checkbox.Content>
              </Checkbox>
            )}
            {session && activeStep === 2 && session.state !== 'awaiting_identity_confirmation' && (
              <DeliveryStep
                isDelivering={deliverSessionMutation.isPending}
                session={session}
                sshUsername={sshUsername}
                sshPassword={sshPassword}
                useCustomSshCredentials={useCustomSshCredentials}
                onUseCustomSshCredentialsChange={setUseCustomSshCredentials}
                onSshUsernameChange={setSshUsername}
                onSshPasswordChange={setSshPassword}
                confirmInstall={confirmInstall}
                onConfirmInstallChange={setConfirmInstall}
              />
            )}
            {session && activeStep === 3 && <ProgressStep name={title} session={session} />}
            {session &&
              (['awaiting_verification', 'completed'].includes(session.state) || session.managementControllerId) && (
                <VerificationStatus session={session} onConfigure={onConfigure ? configureController : undefined} />
              )}
            {createSessionMutation.isError && <ErrorAlert error={createSessionMutation.error} />}
            {confirmHostKeyMutation.isError && <ErrorAlert error={confirmHostKeyMutation.error} />}
            {deliverSessionMutation.isError && <ErrorAlert error={deliverSessionMutation.error} />}
            {removeSessionMutation.isError && <ErrorAlert error={removeSessionMutation.error} />}
            {isCancelConfirmationOpen && (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Canceling revokes the enrollment credential and deletes this commissioning session.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
        </div>
      </DrawerBody>
      <DrawerFooter className="wg:flex-wrap">
        <Button variant="secondary" onPress={isCancelConfirmationOpen ? () => setCancelConfirmationOpen(false) : close}>
          {isCancelConfirmationOpen ? 'Keep enrollment' : 'Close'}
        </Button>
        {!session && activeStep === 0 && (
          <Button
            isDisabled={!name.trim()}
            onPress={() => {
              setStep(1);
            }}
          >
            Continue
          </Button>
        )}
        {!session && activeStep === 1 && (
          <Button
            isPending={isLoading}
            isDisabled={
              !controllerIp.trim() ||
              selectedMqttServerId === null ||
              mqttServersQuery.isPending ||
              mqttServersQuery.isError
            }
            onPress={createSession}
          >
            {isLoading ? 'Preparing commissioning' : 'Scan controller for review'}
          </Button>
        )}
        {session?.state === 'awaiting_identity_confirmation' && (
          <Button
            isPending={isLoading}
            isDisabled={!isolatedIdentity && (!hostKeyFingerprint || hostKeyFingerprint !== session.hostKeyFingerprint)}
            onPress={confirmHostKey}
          >
            {isLoading ? 'Confirming identity' : 'Confirm host key'}
          </Button>
        )}
        {session && canInstall(session) && (
          <Button
            variant="danger"
            isPending={isLoading}
            isDisabled={
              isLoading ||
              (session.state !== 'delivery_failed' && !confirmInstall) ||
              (session.state !== 'delivery_failed' && useCustomSshCredentials && (!sshUsername.trim() || !sshPassword))
            }
            onPress={deliverSession}
          >
            {isLoading
              ? 'Starting installation'
              : session.state === 'delivery_failed'
                ? 'Retry installation'
                : 'Install runtime'}
          </Button>
        )}
        {session &&
          session.state !== 'completed' &&
          (isCancelConfirmationOpen ? (
            <Button
              variant="danger"
              isPending={isLoading}
              onPress={() => removeSessionMutation.mutate(session.id, { onSuccess: close })}
            >
              {isLoading ? 'Removing record' : 'Confirm cancellation'}
            </Button>
          ) : (
            <Button variant="secondary" isDisabled={isLoading} onPress={() => setCancelConfirmationOpen(true)}>
              {session.state === 'revoked' ? 'Delete commissioning record' : 'Cancel enrollment'}
            </Button>
          ))}
      </DrawerFooter>
    </StandardDrawer>
  );
}

function DevicePassport({ className, name, step }: { className?: string; name: string; step: number }) {
  return (
    <aside className={`wg:min-w-0 wg:rounded-large wg:bg-default-100 wg:p-5 ${className ?? ''}`}>
      <CpuIcon className="wg:h-10 wg:w-10 wg:text-primary" />
      <p className="wg:mt-4 wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        CC100 device passport
      </p>
      <p className="wg:mt-1 wg:truncate wg:text-lg wg:font-semibold">{name}</p>
      <div className="wg:mt-5 wg:space-y-3">
        <PassportRow label="Identity" value={step >= 2 ? 'Review required' : 'Not scanned'} />
        <PassportRow label="Runtime" value={step >= 2 ? 'See session status' : 'Not installed'} />
        <PassportRow label="Claim" value={step >= 3 ? 'See session status' : 'Pending'} />
      </div>
      <div className="wg:mt-6 wg:flex wg:gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`wg:h-1.5 wg:flex-1 wg:rounded-full ${index <= step ? 'wg:bg-primary' : 'wg:bg-default-300'}`}
          />
        ))}
      </div>
    </aside>
  );
}

function PassportRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="wg:text-xs wg:text-muted">{label}</p>
      <p className="wg:truncate wg:text-sm wg:font-medium">{value}</p>
    </div>
  );
}

function StepHeading({ step }: { step: number }) {
  const content = [
    [
      'Give this controller a useful name',
      'This name is reserved now and applied automatically when the controller comes online.',
    ],
    [
      'Connect the controller',
      'Enter its private address and choose an MQTT server. Review the scanned identity before installation.',
    ],
    [
      'Review and approve installation',
      'Attraccess verifies the controller automatically before it makes any changes.',
    ],
    [
      'Commissioning status',
      'A saved session does not authorize a new installation. After an interruption, review the status before retrying.',
    ],
  ][step];
  return (
    <div>
      <p className="wg:text-sm wg:font-medium">Step {step + 1} of 4</p>
      <h2 className="wg:mt-1 wg:text-xl wg:font-semibold">{content[0]}</h2>
      <p className="wg:mt-1 wg:text-sm wg:text-muted">{content[1]}</p>
    </div>
  );
}

function OperationStatus({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-3">
      <div className="wg:flex wg:items-center wg:gap-2">
        <Spinner color="accent" size="sm" />
        <p className="wg:text-sm wg:font-medium">{title}</p>
      </div>
      <p className="wg:mt-1 wg:text-xs wg:text-muted">{description}</p>
      <div className="wg:mt-3 wg:h-1 wg:overflow-hidden wg:rounded-full wg:bg-default-200">
        <div className="wg:h-full wg:w-2/5 wg:animate-pulse wg:rounded-full wg:bg-primary" />
      </div>
    </div>
  );
}

function NameStep({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
  return (
    <TextField isRequired name="controller-name">
      <Label>Controller name</Label>
      <Input
        autoFocus
        value={name}
        placeholder="e.g. Pool house controller"
        onChange={(event) => onNameChange(event.target.value)}
      />
    </TextField>
  );
}

function ConnectionStep({
  controllerIp,
  mqttServerId,
  mqttServersQuery,
  onControllerIpChange,
  onMqttServerIdChange,
}: {
  controllerIp: string;
  mqttServerId: Key | null;
  mqttServersQuery: ReturnType<typeof useMqttServersQuery>;
  onControllerIpChange: (value: string) => void;
  onMqttServerIdChange: (value: Key | null) => void;
}) {
  return (
    <div className="wg:space-y-4">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Prepare the CC100 (751-9301), firmware 31</Alert.Title>
          <Alert.Description>
            Have the controller powered using its specified supply and wait for it to finish starting. Connect its
            Ethernet cable to the intended local network. Ask your network administrator for its assigned IP address and
            ensure the Attraccess server can reach it. Keep power and networking connected during installation. If the
            model or firmware is uncertain, check the device label and your maintenance records with the responsible
            administrator before proceeding.
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <TextField isRequired name="controller-ip">
        <Label>Controller IP address</Label>
        <Input
          value={controllerIp}
          placeholder="192.168.1.42"
          onChange={(event) => onControllerIpChange(event.target.value)}
        />
      </TextField>
      {mqttServersQuery.isPending ? (
        <div className="wg:flex wg:justify-center wg:p-2">
          <Spinner color="accent" size="sm" />
        </div>
      ) : mqttServersQuery.isError ? (
        <ErrorAlert error={mqttServersQuery.error} />
      ) : (
        <Select
          className="wg:w-full"
          name="mqttServerId"
          placeholder="Select an MQTT server"
          value={mqttServerId}
          onChange={onMqttServerIdChange}
        >
          <Label>MQTT server</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              renderEmptyState={() => (
                <span className="wg:block wg:p-3 wg:text-sm wg:text-muted">No MQTT servers configured.</span>
              )}
            >
              {(mqttServersQuery.data ?? []).map((server) => (
                <ListBox.Item key={server.id} id={server.id.toString()} textValue={server.name}>
                  <div className="wg:min-w-0 wg:truncate">{server.name}</div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
    </div>
  );
}

function HostKeyConfirmationStep({
  fingerprint,
  expectedFingerprint,
  onFingerprintChange,
}: {
  fingerprint: string;
  expectedFingerprint: string;
  onFingerprintChange: (value: string) => void;
}) {
  return (
    <div className="wg:space-y-4">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Review the controller SSH key</Alert.Title>
          <Alert.Description>
            Compare the scanned fingerprint with a trusted inventory record or a fingerprint obtained independently
            through a trusted administrator. Copying the scan back here is not independent authentication. If no trusted
            fingerprint is available, confirm the physical controller and its cabling on an isolated network you
            control; this reduces exposure but does not independently authenticate the SSH key. Stop if the device or
            network is uncertain. Confirming the key does not start installation.
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <p className="wg:break-all wg:text-sm">Scanned fingerprint: {expectedFingerprint}</p>
      <TextField isRequired name="host-key-fingerprint">
        <Label>Reviewed SSH host-key fingerprint</Label>
        <Input value={fingerprint} onChange={(event) => onFingerprintChange(event.target.value)} />
      </TextField>
    </div>
  );
}

function canInstall(session: CommissioningSession) {
  return ['awaiting_delivery', 'delivery_failed', 'awaiting_codesys_confirmation'].includes(session.state);
}

function CredentialFields({
  intent = 'installation',
  isDisabled,
  username,
  password,
  onUsernameChange,
  onPasswordChange,
}: {
  intent?: 'installation' | 'recovery';
  isDisabled: boolean;
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}) {
  const prefix = intent === 'recovery' ? 'Recovery SSH' : 'Temporary SSH';
  return (
    <div className="wg:grid wg:gap-4 wg:sm:grid-cols-2">
      <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-username`}>
        <Label>{prefix} username</Label>
        <Input autoComplete="off" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
      </TextField>
      <TextField isRequired isDisabled={isDisabled} name={`${intent}-ssh-password`}>
        <Label>{prefix} password</Label>
        <Input
          autoComplete="off"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </TextField>
    </div>
  );
}

function DeliveryStep({
  isDelivering,
  session,
  sshUsername,
  sshPassword,
  useCustomSshCredentials,
  onUseCustomSshCredentialsChange,
  onSshUsernameChange,
  onSshPasswordChange,
  confirmInstall,
  onConfirmInstallChange,
}: {
  isDelivering: boolean;
  session: CommissioningSession;
  sshUsername: string;
  sshPassword: string;
  useCustomSshCredentials: boolean;
  onUseCustomSshCredentialsChange: (value: boolean) => void;
  onSshUsernameChange: (value: string) => void;
  onSshPasswordChange: (value: string) => void;
  confirmInstall: boolean;
  onConfirmInstallChange: (value: boolean) => void;
}) {
  return (
    <div className="wg:space-y-4">
      <CommissioningStatusPanel isActive={isDelivering || session.state === 'delivering'} session={session} />
      {canInstall(session) && session.state === 'delivery_failed' && (
        <p>Retry automatically reconciles the previous attempt and uses the saved SSH credentials.</p>
      )}
      {canInstall(session) && session.state !== 'delivery_failed' && (
        <>
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Destructive installation</Alert.Title>
              <Alert.Description>
                Installing Attraccess on {session.targetHost} takes over this controller. Existing workloads may stop or
                be erased. CODESYS is permanently disabled. Make connected equipment safe before continuing.
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <Checkbox
            isDisabled={isDelivering}
            isSelected={useCustomSshCredentials}
            onChange={onUseCustomSshCredentialsChange}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>Use different SSH credentials</Checkbox.Content>
          </Checkbox>
          {useCustomSshCredentials && (
            <CredentialFields
              isDisabled={isDelivering}
              username={sshUsername}
              password={sshPassword}
              onUsernameChange={onSshUsernameChange}
              onPasswordChange={onSshPasswordChange}
            />
          )}
          <Checkbox
            isRequired
            isDisabled={isDelivering}
            isSelected={confirmInstall}
            onChange={onConfirmInstallChange}
            name="confirm-install"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              I approve this destructive installation and understand that existing applications and data may be lost.
            </Checkbox.Content>
          </Checkbox>
          <p className="wg:text-sm wg:text-muted">
            Attraccess uses the factory root / wago SSH credentials until an enrolled credential is available. A custom
            account must have root or sudo access. Installation automatically checks access and controller
            prerequisites. Custom credentials and approval are cleared after submission or closing.
          </p>
        </>
      )}
    </div>
  );
}

function ProgressStep({ name, session }: { name: string; session: CommissioningSession }) {
  const complete = ['completed', 'revoked', 'claim_interrupted', 'recovery_revocation_pending'].includes(session.state);
  return (
    <div className="wg:space-y-4">
      <DevicePassport className="wg:md:hidden" name={name} step={3} />
      <CommissioningStatusPanel isActive={!complete} session={session} />
      <div className="wg:rounded-large wg:border wg:border-default-200 wg:p-4 wg:text-sm">
        <p className="wg:font-medium">Safe to close</p>
        <p className="wg:mt-1 wg:text-muted">
          This session is saved in the CC100 devices table. Closing this window does not cancel an installation already
          submitted. If installation is interrupted, reopening the session or restarting the server does not authorize
          another attempt.
        </p>
      </div>
      {session.failureReason && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{session.failureReason}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}

function VerificationStatus({
  session,
  onConfigure,
}: {
  session: CommissioningSession;
  onConfigure?: (controllerId: number) => void;
}) {
  const verification = useQuery({
    queryKey: ['wago', 'commissioning-verification', session.id],
    queryFn: () => getCommissioningVerification(session.id),
    refetchInterval: 5000,
  });
  const verifiedControllerId = verification.data?.controllerId;
  const securityControllerId = verifiedControllerId ?? session.managementControllerId;
  return (
    <div className="wg:space-y-3">
      <Alert status={session.state === 'completed' ? 'success' : 'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {session.state === 'completed' ? 'Enrollment verified' : 'Verifying enrollment automatically'}
          </Alert.Title>
          <Alert.Description>
            {verification.isError ? (
              'Verification could not be loaded. No readiness claim is made.'
            ) : verification.data ? (
              <ul>
                <li>Permanent heartbeat: {verification.data.permanentConnection ? 'received' : 'pending'}</li>
                <li>Enrollment credential revoked: {verification.data.enrollmentRevoked ? 'verified' : 'pending'}</li>
                <li>
                  Desired/reported configuration: {verification.data.configurationApplied ? 'applied' : 'pending'}
                </li>
                <li>Runtime hardware probe: {verification.data.hardwareReadiness ?? 'unverified'}</li>
                <li>Management hardening: {verification.data.managementHardening}</li>
                <li>Physical qualification: required before production use</li>
              </ul>
            ) : (
              'Checking commissioning evidence...'
            )}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {session.state === 'completed' && securityControllerId && (
        <>
          {onConfigure && verifiedControllerId && (
            <Button onPress={() => onConfigure(verifiedControllerId)}>Configure inputs and outputs</Button>
          )}
          <CommissioningSecurityPanel
            key={session.id}
            sessionId={session.id}
            controllerId={securityControllerId}
          />
        </>
      )}
    </div>
  );
}

function CommissioningStatusPanel({ isActive, session }: { isActive: boolean; session: CommissioningSession }) {
  const percent = session.progressPercent ?? 0;
  const isQueued = session.state === 'awaiting_delivery';
  const hasFailure = !isActive && Boolean(session.failureReason);
  const title = isQueued
    ? 'Installation approval required'
    : (session.progressStep ?? (isActive ? 'Preparing commissioning' : commissioningLabel(session.state)));
  const detail = isQueued
    ? 'Review the installation, enter temporary SSH credentials, and approve this attempt. Saved sessions do not start or resume installation automatically.'
    : (session.progressDetail ?? 'Waiting for the next commissioning operation.');
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-4">
      <div className="wg:flex wg:items-start wg:gap-3">
        {isActive ? (
          <Spinner color="accent" size="sm" />
        ) : hasFailure ? (
          <AlertCircleIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-danger" />
        ) : isQueued ? (
          <CpuIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-muted" />
        ) : (
          <CheckCircle2Icon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-success" />
        )}
        <div className="wg:min-w-0 wg:flex-1">
          <div className="wg:flex wg:items-center wg:justify-between wg:gap-3">
            <p className="wg:font-medium">{title}</p>
            <span className="wg:text-sm wg:text-muted">{percent}%</span>
          </div>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">{detail}</p>
          <div className="wg:mt-3 wg:h-1.5 wg:overflow-hidden wg:rounded-full wg:bg-default-200">
            <div
              className={`wg:h-full wg:rounded-full wg:transition-[width] wg:duration-500 ${hasFailure ? 'wg:bg-danger' : 'wg:bg-primary'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
      {hasFailure && (
        <Alert className="wg:mt-4" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Delivery error</Alert.Title>
            <Alert.Description>{session.failureReason}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ActivityLog auditLog={session.auditLog} />
    </div>
  );
}

function ActivityLog({ auditLog }: { auditLog: string }) {
  const events = parseActivityLog(auditLog);
  if (!events.length) return null;
  return (
    <div className="wg:mt-4 wg:border-t wg:border-default-200 wg:pt-3">
      <p className="wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">Activity</p>
      <ol className="wg:mt-2 wg:space-y-1">
        {events.map((event) => (
          <li key={`${event.at}-${event.event}`} className="wg:text-xs wg:text-muted">
            <span className="wg:text-foreground">{formatActivity(event.event)}</span>{' '}
            <span>{new Date(event.at).toLocaleTimeString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatActivity(event: string): string {
  return event.replace(/^progress: /, '').replaceAll('_', ' ');
}

function parseActivityLog(auditLog: string): Array<{ at: string; event: string }> {
  try {
    const entries = JSON.parse(auditLog) as Array<{ at?: unknown; event?: unknown }>;
    return entries
      .filter(
        (entry): entry is { at: string; event: string } =>
          typeof entry.at === 'string' && typeof entry.event === 'string',
      )
      .slice(-5);
  } catch {
    return [];
  }
}

function sessionStep(session: CommissioningSession | null): number {
  if (!session) return 0;
  return [
    'awaiting_delivery',
    'delivering',
    'awaiting_identity_confirmation',
    'awaiting_codesys_confirmation',
    'delivery_failed',
  ].includes(session.state)
    ? 2
    : 3;
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{error instanceof Error ? error.message : 'Please try again.'}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
