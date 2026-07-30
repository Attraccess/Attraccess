// Zigbee pairing wizard (ATT-789).
//
// Pairing takes minutes and spans two systems, so the backend runs it as a job
// and this drawer polls it. The prerequisites are not decoration: the ESP32-C6
// shares one antenna between WiFi, BLE and Zigbee, and "steering failed" is by
// far the most common outcome when they are ignored.
import { Button, Chip, DrawerBody, DrawerFooter, DrawerHeader, Spinner } from '@heroui/react';
import { CheckCircle2Icon, RadioTowerIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPairingJob, startPairing, type PairingJob, type PairingStep, type ShellyDevice } from './api';
import { StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';

const STEP_LABELS: Record<PairingStep, string> = {
  'opening-network': 'Opening the Zigbee network for joining',
  'enabling-zigbee': 'Switching the device’s Zigbee radio on',
  'waiting-for-reboot': 'Waiting for the device to reboot',
  'network-steering': 'Asking the device to look for a network',
  'waiting-for-join': 'Waiting for the device to join',
  'waiting-for-interview': 'zigbee2mqtt is interviewing the device',
  linking: 'Naming the device and linking it',
};

const STEP_ORDER: PairingStep[] = [
  'opening-network',
  'enabling-zigbee',
  'waiting-for-reboot',
  'network-steering',
  'waiting-for-join',
  'waiting-for-interview',
  'linking',
];

const POLL_INTERVAL_MS = 2000;

function Prerequisites() {
  return (
    <div className="sh:flex sh:flex-col sh:gap-2 sh:rounded-lg sh:bg-surface-tertiary sh:p-3">
      <span className="sh:text-xs sh:font-medium sh:text-muted">Before you start</span>
      {/* Tailwind's preflight strips list markers, so ask for them back — three
          unbulleted lines read as prose, not as a checklist. */}
      <ul className="sh:flex sh:list-disc sh:flex-col sh:gap-1.5 sh:pl-5 sh:text-sm sh:text-default-700">
        <li>Update the device firmware over WiFi first — Zigbee OTA is not supported by Shelly.</li>
        <li>Turn Bluetooth off on the device. It shares one antenna with Zigbee and blocks joining.</li>
        <li>Pair within ~30 cm of the coordinator, then install the device in its final position.</li>
      </ul>
    </div>
  );
}

function Progress({ job }: { job: PairingJob }) {
  const currentIndex = STEP_ORDER.indexOf(job.step);

  return (
    <ol className="sh:flex sh:flex-col sh:gap-2" data-cy="shelly-pair-progress">
      {STEP_ORDER.map((step, index) => {
        const isDone = index < currentIndex || job.status === 'succeeded';
        const isCurrent = index === currentIndex && job.status === 'running';
        return (
          <li
            key={step}
            className={`sh:flex sh:items-center sh:gap-2 sh:text-sm ${isDone || isCurrent ? 'sh:text-default-800' : 'sh:text-default-400'}`}
          >
            <span className="sh:flex sh:h-5 sh:w-5 sh:shrink-0 sh:items-center sh:justify-center" aria-hidden="true">
              {isCurrent ? (
                <Spinner size="sm" color="accent" />
              ) : isDone ? (
                <CheckCircle2Icon className="sh:h-4 sh:w-4 sh:text-success" />
              ) : (
                <span className="sh:h-1.5 sh:w-1.5 sh:rounded-full sh:bg-default-300" />
              )}
            </span>
            <span>{STEP_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ZigbeePairDrawer({
  device,
  onOpenChange,
  onPaired,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onPaired: () => void;
}) {
  const [job, setJob] = useState<PairingJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fires onPaired exactly once per successful run, rather than on every poll.
  const reportedSuccess = useRef(false);

  useEffect(() => {
    if (!device) return;
    reportedSuccess.current = false;
    setError(null);
    void getPairingJob(device.id)
      .then(setJob)
      .catch(() => setJob(null));
  }, [device]);

  // Poll only while a run is actually in flight.
  useEffect(() => {
    if (!device || job?.status !== 'running') return;
    const timer = setInterval(() => {
      void getPairingJob(device.id)
        .then(setJob)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [device, job?.status]);

  useEffect(() => {
    if (job?.status === 'succeeded' && !reportedSuccess.current) {
      reportedSuccess.current = true;
      onPaired();
    }
  }, [job?.status, onPaired]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const start = useCallback(async () => {
    if (!device) return;
    setStarting(true);
    setError(null);
    reportedSuccess.current = false;
    try {
      setJob(await startPairing(device.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }, [device]);

  const isRunning = job?.status === 'running';
  const isSucceeded = job?.status === 'succeeded';

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange} label="Pair to Zigbee">
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <RadioTowerIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">Pair to Zigbee</h2>
            </div>
            {device && (
              <p className="sh:text-sm sh:text-muted">
                Join {device.name} ({device.ipAddress}) to the zigbee2mqtt gateway.
              </p>
            )}
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <div className="sh:flex sh:flex-col sh:gap-4">
          {!job && <Prerequisites />}

          {job && <Progress job={job} />}

          {job?.status === 'succeeded' && (
            <StatusAlert status="success" title="Paired" dataCy="shelly-pair-success">
              <div className="sh:flex sh:flex-col sh:gap-1">
                <span>The device now talks to Attraccess through zigbee2mqtt.</span>
                <span className="sh:font-mono sh:text-xs sh:break-all">{job.ieeeAddress}</span>
                <span className="sh:text-xs">
                  Topic name: <span className="sh:font-mono sh:break-all">{job.friendlyName}</span>
                </span>
              </div>
            </StatusAlert>
          )}

          {job?.status === 'failed' && (
            <StatusAlert status="danger" title="Pairing failed" dataCy="shelly-pair-failed">
              {job.error}
            </StatusAlert>
          )}

          {isRunning && (
            <Chip variant="soft" color="warning" size="sm" className="sh:self-start">
              The join window stays open for up to 254 seconds
            </Chip>
          )}

          {error && (
            <StatusAlert status="danger" title="Could not start pairing" dataCy="shelly-pair-error">
              {error}
            </StatusAlert>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          {isSucceeded ? 'Done' : 'Close'}
        </Button>
        {/* Once paired there is nothing left to start — offering the button
            again invites a pointless second join of the same device. */}
        {!isSucceeded && (
          <Button
            variant="primary"
            isPending={starting || isRunning}
            isDisabled={isRunning}
            onPress={() => void start()}
            data-cy="shelly-pair-start"
          >
            <RadioTowerIcon className="sh:h-4 sh:w-4" /> {job?.status === 'failed' ? 'Retry pairing' : 'Start pairing'}
          </Button>
        )}
      </DrawerFooter>
    </StandardDrawer>
  );
}
