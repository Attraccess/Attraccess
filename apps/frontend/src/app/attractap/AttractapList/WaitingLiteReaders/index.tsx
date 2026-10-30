// Lists Attractap Lite readers that wait for approval and approves one by the colour pattern on its LED ring
// FEATURE: ATT-1171 Lite colour pattern approval
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  ColorSwatch,
  Description,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { CheckIcon } from 'lucide-react';
import { EmptyState, PageHeader, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  ApproveDeviceEnrollmentResponseDto,
  WaitingLiteReaderDto,
  useDeviceEnrollmentServiceApproveLiteEnrollment,
  useDeviceEnrollmentServiceListWaitingLiteReaders,
  useDeviceEnrollmentServiceListWaitingLiteReadersKey,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { useNow } from '../../../../hooks/useNow';
import { getApiErrorMessage } from '../../../../utils/apiError';
import de from './de.json';
import en from './en.json';

type LedColor = WaitingLiteReaderDto['pattern'][number];

// Close to what the WS2812 ring shows (yellow is the firmware's 255/200/0), so swatch and ring look alike.
const SWATCH: Record<LedColor, string> = {
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffc800',
  magenta: '#ff00ff',
  white: '#ffffff',
};

const POLL_INTERVAL_MS = 3000;
// Same limit as ApproveLiteEnrollmentDto.name
const NAME_MAX_LENGTH = 64;

// One row in ring order: segment 4 sits next to segment 1 on the ring, so any other layout (e.g. a 2x2 grid read
// clockwise) could make an admin read a different reader's pattern.
function PatternSwatches({ pattern }: Readonly<{ pattern: LedColor[] }>) {
  const { t } = useTranslations({ en, de });
  return (
    <ol className="flex flex-row gap-3" data-cy="lite-pattern">
      {pattern.map((color, index) => (
        <li key={`${color}-${index}`} className="flex flex-col items-center gap-1">
          <span aria-hidden>
            <ColorSwatch color={SWATCH[color]} size="sm" />
          </span>
          <span className="text-xs">{t(`colors.${color}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function formatWaiting(since: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Shown to everyone who may approve devices; renders nothing for other users. */
export function WaitingLiteReaders() {
  const { hasPermission } = useAuth();
  if (!hasPermission('resources.update')) return null;
  return <WaitingLiteReadersCard />;
}

function WaitingLiteReadersCard() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = useNow();

  const {
    data: readers = [],
    dataUpdatedAt,
    isError: loadFailed,
  } = useDeviceEnrollmentServiceListWaitingLiteReaders(undefined, {
    refetchInterval: POLL_INTERVAL_MS,
  });

  // What the admin saw when pressing Approve: the pattern is sent back so a rotation in between can not
  // approve a different reader than the one in front of them.
  const [selected, setSelected] = useState<WaitingLiteReaderDto | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApproveDeviceEnrollmentResponseDto | null>(null);

  // isPending only flips after the next render, so a double click would send the request twice and the second
  // one would fail (and count as a wrong attempt) because the reader is already approved.
  const submitting = useRef(false);

  const { mutate: approve, isPending } = useDeviceEnrollmentServiceApproveLiteEnrollment({
    onSuccess: (approved) => {
      submitting.current = false;
      setSelected(null);
      setResult(approved);
      void queryClient.invalidateQueries();
    },
    // Close the confirmation on any failure: it holds the pattern from when Approve was pressed, so retrying
    // from it could resend a stale pattern and use up the approver's attempts. The admin compares the
    // refreshed row again instead.
    onError: (failure) => {
      submitting.current = false;
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: [useDeviceEnrollmentServiceListWaitingLiteReadersKey] });
      const status = (failure as ApiError)?.status;
      if (status === 404) setError(t('error.notFound'));
      else if (status === 429) setError(t('error.tooManyAttempts'));
      else if (status === 502) setError(t('error.deliveryFailed'));
      else setError(t('error.generic', { error: getApiErrorMessage(failure as ApiError) }));
    },
  });

  const openDialog = useCallback((reader: WaitingLiteReaderDto) => {
    setSelected(reader);
    setName('');
  }, []);

  const submit = useCallback(() => {
    if (!selected || isPending || submitting.current) return;
    submitting.current = true;
    approve({
      requestBody: {
        pendingId: selected.pendingId,
        pattern: selected.pattern,
        ...(name.trim() ? { name: name.trim() } : {}),
      },
    });
  }, [selected, name, isPending, approve]);

  // useNow ticks once a second, so right after a poll `now` can be older than the fetch.
  const secondsSinceFetch = Math.max(0, Math.floor((now.getTime() - dataUpdatedAt) / 1000));

  return (
    <>
      <Card data-cy="waiting-lite-readers">
        <Card.Header>
          <PageHeader noMargin title={t('title')} subtitle={t('description')} />
        </Card.Header>
        <Card.Content>
          <Table>
            <TableScrollContainer>
              <TableContent aria-label={t('title')}>
                <TableHeader>
                  <TableColumn isRowHeader>{t('columns.pattern')}</TableColumn>
                  <TableColumn>{t('columns.rotates')}</TableColumn>
                  <TableColumn>{t('columns.firmware')}</TableColumn>
                  <TableColumn>{t('columns.waiting')}</TableColumn>
                  <TableColumn>{t('columns.address')}</TableColumn>
                  <TableColumn>{t('columns.actions')}</TableColumn>
                </TableHeader>
                <TableBody
                  items={readers}
                  dependencies={[now]}
                  renderEmptyState={() => <EmptyState message={loadFailed ? t('loadFailed') : t('empty')} />}
                >
                  {(reader) => (
                    <TableRow key={reader.pendingId} id={reader.pendingId}>
                      <TableCell>
                        <PatternSwatches pattern={reader.pattern} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {t('rotatesIn', { seconds: Math.max(0, reader.rotatesInSeconds - secondsSinceFetch) })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {reader.firmware?.name}
                        {reader.firmware?.variant ? ` (${reader.firmware.variant})` : ''}
                        {reader.firmware?.version && (
                          <>
                            <br />
                            <Chip>v{reader.firmware.version}</Chip>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatWaiting(reader.waitingSince, now)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{reader.clientAddress}</TableCell>
                      <TableCell>
                        <Button variant="secondary" onPress={() => openDialog(reader)} data-cy="lite-approve-button">
                          <CheckIcon className="w-4 h-4" />
                          {t('approve')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      {selected && (
        <StatusDialog
          isOpen
          onClose={() => setSelected(null)}
          status="warning"
          title={t('dialog.title')}
          action={{ label: t('dialog.submit'), onPress: submit, isPending, 'data-cy': 'lite-approve-confirm' }}
          data-cy="lite-approve-dialog"
        >
          <div className="flex flex-col gap-3">
            <Description>
              {t('dialog.warning', {
                pattern: selected.pattern.map((color) => t(`colors.${color}`)).join(', '),
              })}
            </Description>
            <PatternSwatches pattern={selected.pattern} />
            <TextField value={name} onChange={setName} isDisabled={isPending}>
              <Label>{t('dialog.nameLabel')}</Label>
              <Input autoComplete="off" maxLength={NAME_MAX_LENGTH} data-cy="lite-approve-name" />
            </TextField>
          </div>
        </StatusDialog>
      )}

      {error && (
        <StatusDialog
          isOpen
          onClose={() => setError(null)}
          status="error"
          title={t('error.title')}
          data-cy="lite-approve-error"
        >
          {error}
        </StatusDialog>
      )}

      {result && (
        <StatusDialog
          isOpen
          onClose={() => setResult(null)}
          status="success"
          title={t('success.title')}
          closeLabel={t('success.close')}
          action={{
            label: t('success.openReader'),
            onPress: () => {
              setResult(null);
              navigate(`/attractap/readers?editReader=${result.id}`);
            },
            'data-cy': 'lite-approve-open-reader',
          }}
          data-cy="lite-approve-success"
        >
          {t('success.description', { name: result.name })}
        </StatusDialog>
      )}
    </>
  );
}
