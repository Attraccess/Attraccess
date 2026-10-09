import { Counter, Gauge, Registry } from 'prom-client';
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
  return {
    attractapDevicesConnected,
    attractapReaderConnected,
    attractapNfcTapsTotal,
    attractapFirmwareUpdatesTotal,
    attractapCrashReportsTotal,
  };
}
