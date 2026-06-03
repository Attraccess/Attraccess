import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { BugIcon, UploadIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  CoredumpSymbolicationResultDto,
  useAttractapServiceGetFirmwares,
  useAttractapServiceSymbolicateCoredump,
} from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { Select } from '../../../components/select';
import { useToastMessage } from '../../../components/toastProvider';
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';

import de from './de.json';
import en from './en.json';

const AUTO_DETECT = '__auto__';

export function CoredumpDebug() {
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();

  const { data: firmwares } = useAttractapServiceGetFirmwares();
  const symbolicate = useAttractapServiceSymbolicateCoredump();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [firmwareKey, setFirmwareKey] = useState<string>(AUTO_DETECT);
  const [result, setResult] = useState<CoredumpSymbolicationResultDto | null>(null);

  const firmwareOptions = useMemo(
    () => [
      { key: AUTO_DETECT, label: t('form.autoDetect'), firmware: undefined },
      ...(firmwares ?? []).map((firmware) => ({
        key: `${firmware.name}::${firmware.variant}`,
        label: `${firmware.name} (${firmware.variant}) v${firmware.version}`,
        firmware,
      })),
    ],
    [firmwares, t],
  );

  const onSubmit = () => {
    if (!file) {
      return;
    }

    const selected = firmwareOptions.find((option) => option.key === firmwareKey)?.firmware;

    symbolicate.mutate(
      {
        formData: {
          coredump: file,
          firmwareName: selected?.name,
          variantName: selected?.variant,
        },
      },
      {
        onSuccess: (data) => setResult(data),
        onError: (error) =>
          toast.error({ title: t('error.title'), description: (error as Error).message }),
      },
    );
  };

  return (
    <>
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} backTo="/attractap/readers" />

      <Card className="mb-4">
        <Card.Content className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            data-cy="coredump-file-input"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
            }}
          />

          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <Button variant="ghost" onPress={() => fileInputRef.current?.click()} data-cy="coredump-pick-button">
              <UploadIcon className="w-4 h-4" />
              {file ? file.name : t('form.pickFile')}
            </Button>

            <Select
              className="md:max-w-xs"
              label={t('form.firmwareLabel')}
              value={firmwareKey}
              onChange={setFirmwareKey}
              items={firmwareOptions.map((option) => ({ key: option.key, label: option.label }))}
              data-cy="coredump-firmware-select"
            />

            <Button
              variant="primary"
              isDisabled={!file}
              isPending={symbolicate.isPending}
              onPress={onSubmit}
              data-cy="coredump-symbolicate-button"
            >
              <BugIcon className="w-4 h-4" />
              {t('form.symbolicate')}
            </Button>
          </div>

          <p className="text-sm text-default-500">{t('form.hint')}</p>
        </Card.Content>
      </Card>

      {result && (
        <div className="flex flex-col gap-4" data-cy="coredump-result">
          <Alert status="warning">
            <AlertStatusIcon status="warning" />
            <AlertContent>
              <AlertTitle>{result.panicReason ?? t('result.unknownPanic')}</AlertTitle>
              <AlertDescription>
                {t('result.matchedBy')}: {result.matchedBy}
                {result.buildId ? ` (${result.buildId})` : ''}
                {typeof result.faultingCore === 'number' ? ` · ${t('result.core')} ${result.faultingCore}` : ''}
                {result.faultingTaskName ? ` · ${result.faultingTaskName}` : ''}
              </AlertDescription>
            </AlertContent>
          </Alert>

          <Card>
            <Card.Header>
              <PageHeader noMargin title={t('result.backtrace')} />
            </Card.Header>
            <Card.Content>
              <Table>
                <TableScrollContainer>
                  <TableContent aria-label="backtrace">
                    <TableHeader>
                      <TableColumn isRowHeader>#</TableColumn>
                      <TableColumn>{t('result.pc')}</TableColumn>
                      <TableColumn>{t('result.function')}</TableColumn>
                      <TableColumn>{t('result.location')}</TableColumn>
                    </TableHeader>
                    <TableBody items={result.backtrace}>
                      {(frame) => (
                        <TableRow key={frame.index}>
                          <TableCell>{frame.index}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">{frame.pc}</TableCell>
                          <TableCell className="font-mono">{frame.function ?? '—'}</TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            {frame.file ? `${frame.file}${frame.line ? `:${frame.line}` : ''}` : '—'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <PageHeader noMargin title={t('result.tasks')} />
            </Card.Header>
            <Card.Content>
              <div className="flex flex-row flex-wrap gap-2">
                {result.tasks.map((task) => (
                  <Chip key={task.name} color={task.isCrashed ? 'danger' : undefined}>
                    {task.name}
                  </Chip>
                ))}
              </div>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <PageHeader noMargin title={t('result.raw')} />
            </Card.Header>
            <Card.Content>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs" data-cy="coredump-raw">
                {result.rawText}
              </pre>
            </Card.Content>
          </Card>
        </div>
      )}
    </>
  );
}
