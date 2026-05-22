import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, DateValue, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalHeader, RangeCalendar, RangeValue } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { useCallback, useMemo, useRef, useState } from 'react';
import { getLocalTimeZone } from '@internationalized/date';
import { ResourceUsageExport } from './resource-usage';
import { BillingTransactionsExport } from './billing-transactions';

export function CsvExport() {
  const { t } = useTranslations({
    de,
    en,
  });

  const [dateRange, setDateRange] = useState<RangeValue<DateValue>>();
  const [activeExportKey, setActiveExport] = useState<string>('');
  const [showExport, setShowExport] = useState(false);

  const formatDateTime = useDateTimeFormatter({ showTime: false });

  const openExport = useCallback((exportName: string) => {
    setActiveExport(exportName);
    setShowExport(true);
  }, []);

  const dateRangeStartFormatted = useMemo(
    () => formatDateTime(dateRange?.start?.toDate(getLocalTimeZone())),
    [formatDateTime, dateRange],
  );

  const dateRangeEndFormatted = useMemo(
    () => formatDateTime(dateRange?.end?.toDate(getLocalTimeZone())),
    [formatDateTime, dateRange],
  );

  const now = useRef(new Date());

  const exportTypes = useMemo(() => {
    return [
      {
        key: 'resourceUsageHours',
        component: ResourceUsageExport,
      },
      {
        key: 'billingTransactions',
        component: BillingTransactionsExport,
      },
    ] as const;
  }, []);

  const activeExport = useMemo(() => {
    return exportTypes.find((exportType) => exportType.key === activeExportKey);
  }, [exportTypes, activeExportKey]);

  return (
    <>
      <Card>
        <Card.Header>{t('title')}</Card.Header>
        <Card.Content>
          <span className="font-bold">{t('rangeCalendar.selection.label')}</span>
          <div className="flex gap-4 flex-row flex-wrap">
            <RangeCalendar
              value={dateRange ?? null}
              onChange={(value) => setDateRange(value)}
              id="date-range"
              aria-label={t('rangeCalendar.label')}
              data-cy="csv-export-range-calendar"
            >
              <RangeCalendar.Header>
                <RangeCalendar.Heading />
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => <RangeCalendar.Cell date={date} />}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
            <p>
              <br />
              {t('rangeCalendar.selection.start', {
                date: dateRangeStartFormatted,
              })}
              <br />
              {t('rangeCalendar.selection.end', { date: dateRangeEndFormatted })}
            </p>
          </div>
        </Card.Content>
        <Card.Footer>
          {exportTypes.map((exportType) => (
            <Button
              key={exportType.key}
              isDisabled={!dateRange}
              onPress={() => {
                openExport(exportType.key);
              }}
              data-cy={`csv-export-${exportType.key}-button`}
            >
              {t(`exports.${exportType.key}.button`)}
            </Button>
          ))}
        </Card.Footer>
      </Card>

      <Modal
        isOpen={showExport}
        onOpenChange={(open) => {
          if (!open) setShowExport(false);
        }}
        data-cy="csv-export-modal"
      >
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog>
              {() => (
                <>
                  <ModalHeader>
                    <div>
                      {activeExportKey && t(`exports.${activeExportKey}.title`)}
                      <br />
                      <small>
                        {t('exports.modal.subtitle', { start: dateRangeStartFormatted, end: dateRangeEndFormatted })}
                      </small>
                    </div>
                  </ModalHeader>

                  <ModalBody>
                    {activeExport && (
                      <activeExport.component
                        start={dateRange?.start?.toDate(getLocalTimeZone()) ?? now.current}
                        end={dateRange?.end?.toDate(getLocalTimeZone()) ?? now.current}
                      />
                    )}
                  </ModalBody>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
