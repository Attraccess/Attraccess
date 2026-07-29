// Manual "add a device by IP" drawer (ATT-496).
import { Button, DrawerBody, DrawerHeader, Form } from '@heroui/react';
import { PlusIcon, XIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { addDevice } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

export function AddDeviceDrawer({
  isOpen,
  onOpenChange,
  onAdded,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [ipAddress, setIpAddress] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // The button is both type="submit" and onPress={submit}, so one click can call
  // this twice; a ref (not the state) because both calls land in the same tick.
  const inFlight = useRef(false);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    const ip = ipAddress.trim();
    if (!ip) {
      setError('IP address is required.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await addDevice({ ipAddress: ip, name: name.trim() || undefined });
      setIpAddress('');
      setName('');
      onAdded();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [ipAddress, name, onAdded, close]);

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Add a device</h2>
            <p className="text-sm text-muted">
              Enter the device's IP address. We probe <code>GET /shelly</code> to detect its generation and model.
            </p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <TextFieldRow
            label="IP address"
            value={ipAddress}
            onChange={setIpAddress}
            placeholder="192.168.1.42"
            required
            dataCy="shelly-add-ip"
          />
          <TextFieldRow
            label="Name (optional)"
            value={name}
            onChange={setName}
            placeholder="Workshop light"
            dataCy="shelly-add-name"
          />
          {error && (
            <StatusAlert status="danger" title="Could not add the device" dataCy="shelly-add-error">
              {error}
            </StatusAlert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isPending={submitting} onPress={submit} data-cy="shelly-add-submit">
              <PlusIcon className="h-4 w-4" /> Add device
            </Button>
          </div>
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
    </StandardDrawer>
  );
}
