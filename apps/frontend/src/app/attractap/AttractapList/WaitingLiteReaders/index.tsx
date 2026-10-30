// Lists Attractap Lite readers that wait for approval and approves one by the colour pattern on its LED ring
// FEATURE: ATT-1171 Lite colour pattern approval
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
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

function PatternSwatches({ pattern, wrap = false }: Readonly<{ pattern: LedColor[]; wrap?: boolean }>) {
  const { t } = useTranslations({ en, de });
  return (
    <ul className={wrap ? 'flex flex-row flex-wrap gap-3' : 'grid min-w-44 grid-cols-2 gap-x-3 gap-y-1'} data-cy="lite-pattern">
      {pattern.map((color, index) => (
        <li key={`${color}-${index}`} className="flex flex-row items-center gap-1">
          <span
            aria-hidden
            className="inline-block size-5 rounded-full border border-default"
            style={{ backgroundColor: SWATCH[color] }}
          />
          <span className="text-sm">{t(`colors.${color}`)}</span>
        </li>
      ))}
    </ul>
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

  const { data: readers = [], dataUpdatedAt } = useDeviceEnrollmentServiceListWaitingLiteReaders(undefined, {
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
    onError: (failure) => {
      submitting.current = false;
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
    setError(null);
  }, []);

  const submit = useCallback(() => {
    if (!selected || isPending || submitting.current) return;
    submitting.current = true;
    setError(null);
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
                <TableBody items={readers} dependencies={[now]} renderEmptyState={() => <EmptyState message={t('empty')} />}>
                  {(reader) => (
                    <TableRow key={reader.pendingId} id={reader.pendingId}>
                      <TableCell>
                        <PatternSwatches pattern={reader.pattern} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t('rotatesIn', { seconds: Math.max(0, reader.rotatesInSeconds - secondsSinceFetch) })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {[reader.firmware?.name, reader.firmware?.variant].filter(Boolean).join(' ')}
                        {reader.firmware?.version ? ` v${reader.firmware.version}` : ''}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatWaiting(reader.waitingSince, now)}</TableCell>
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
          closeLabel={t('dialog.cancel')}
          action={{ label: t('dialog.submit'), onPress: submit, isPending, 'data-cy': 'lite-approve-confirm' }}
          data-cy="lite-approve-dialog"
        >
          <div className="flex flex-col gap-3">
            <Description>
              {t('dialog.warning', {
                pattern: selected.pattern.map((color) => t(`colors.${color}`)).join(', '),
              })}
            </Description>
            <PatternSwatches pattern={selected.pattern} wrap />
            <TextField value={name} onChange={setName} isDisabled={isPending}>
              <Label>{t('dialog.nameLabel')}</Label>
              <Input autoComplete="off" maxLength={NAME_MAX_LENGTH} data-cy="lite-approve-name" />
            </TextField>
            {error && (
              <Description className="text-danger" role="alert">
                {error}
              </Description>
            )}
          </div>
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
