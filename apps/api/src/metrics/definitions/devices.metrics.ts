import { Counter, Gauge, Registry } from 'prom-client';
import { CRASH_WATCHDOG_REASONS, POWER_ON_REASONS } from '../reset-report-metrics';
export function createDevicesMetrics(registry: Registry) {
  const attractapDevicesConnected = new Gauge({
    name: 'attraccess_attractap_devices_connected',
    help: 'Number of connected Attractap devices',
    registers: [registry],
  });

  const attractapReaderConnected = new Gauge({
    name: 'attraccess_attractap_reader_connected',
    help: 'Connection state per Attractap reader (1 = connected, 0 = disconnected)',
    labelNames: ['reader_id', 'reader_name'],
    registers: [registry],
  });

  const attractapNfcTapsTotal = new Counter({
    name: 'attraccess_attractap_nfc_taps_total',
    help: 'Total number of NFC tap events',
    labelNames: ['reader_id'],
    registers: [registry],
  });

  const attractapFirmwareUpdatesTotal = new Counter({
    name: 'attraccess_attractap_firmware_updates_total',
    help: 'Total number of firmware update events',
    labelNames: ['reader_id'],
    registers: [registry],
  });

  const attractapCrashReportsTotal = new Counter({
    name: 'attraccess_attractap_crash_reports_total',
    help: 'Total number of crash reports received from Attractap readers',
    labelNames: ['reader_id', 'reset_reason'],
    registers: [registry],
  });

  const attractapResetReportsLastHour = new Gauge({
    name: 'attraccess_attractap_reset_reports_last_hour',
    help: `Exact number of stored Attractap reset reports received in the last hour, by category (crash_watchdog = ${CRASH_WATCHDOG_REASONS.join('/')}, power_on = ${POWER_ON_REASONS.join('/')}). Counted from the database at each scrape.`,
    labelNames: ['category'],
    registers: [registry],
  });

  const attractapResetReportReadersLastHour = new Gauge({
    name: 'attraccess_attractap_reset_report_readers_last_hour',
    help: 'Reader and reset reason text for the reset reports of the last hour, by category. The value is the report count; the readers label is for notification text only.',
    labelNames: ['category', 'readers'],
    registers: [registry],
  });

  const readerUiOpenAlerts = new Gauge({
    name: 'attraccess_reader_ui_open_alerts',
    help: 'Open reader UI admin alerts by kind (breaker-open, load-failure, crash-loop). Plugin contributions are degraded while an alert is open.',
    labelNames: ['kind'],
    registers: [registry],
  });

  return {
    readerUiOpenAlerts,
    attractapResetReportsLastHour,
    attractapResetReportReadersLastHour,
    attractapDevicesConnected,
    attractapReaderConnected,
    attractapNfcTapsTotal,
    attractapFirmwareUpdatesTotal,
    attractapCrashReportsTotal,
  };
}
