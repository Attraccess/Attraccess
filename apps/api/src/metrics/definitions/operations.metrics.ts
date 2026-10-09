import { Counter, Gauge, Histogram, Registry } from 'prom-client';
export function createOperationsMetrics(registry: Registry) {
  const billingTransactionsTotal = new Counter({
    name: 'attraccess_billing_transactions_total',
    help: 'Total number of billing transactions',
    labelNames: ['status'],
    registers: [registry],
  });

  const billingTransactionAmount = new Histogram({
    name: 'attraccess_billing_transaction_amount',
    help: 'Billing transaction amounts in base currency units',
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [registry],
  });

  const projectsTotal = new Gauge({
    name: 'attraccess_projects_total',
    help: 'Total number of projects',
    registers: [registry],
  });

  const emailSentTotal = new Counter({
    name: 'attraccess_email_sent_total',
    help: 'Total number of emails sent',
    labelNames: ['status'],
    registers: [registry],
  });

  const mqttServersTotal = new Gauge({
    name: 'attraccess_mqtt_servers_total',
    help: 'Total number of configured MQTT servers',
    registers: [registry],
  });

  const mqttServersHealthy = new Gauge({
    name: 'attraccess_mqtt_servers_healthy',
    help: 'Number of healthy MQTT servers',
    registers: [registry],
  });

  const pluginsLoaded = new Gauge({
    name: 'attraccess_plugins_loaded',
    help: 'Number of loaded plugins',
    registers: [registry],
  });

  const companionDownloadsTotal = new Counter({
    name: 'attraccess_companion_downloads_total',
    help: 'Total number of companion app binary download attempts',
    labelNames: ['platform', 'arch', 'status'],
    registers: [registry],
  });

  const authorizationCacheRequestsTotal = new Counter({
    name: 'attraccess_authorization_cache_requests_total',
    help: 'Total number of canControllResource() authorization cache lookups',
    labelNames: ['result'],
    registers: [registry],
  });

  const authorizationCacheSize = new Gauge({
    name: 'attraccess_authorization_cache_size',
    help: 'Current number of entries in the authorization cache',
    registers: [registry],
  });

  const maintenanceUsageQueryWindowDays = new Histogram({
    name: 'attraccess_maintenance_usage_query_window_days',
    help: 'Lookback window in days for usage data fetched per resource during bulk maintenance schedule evaluation; watch for unexpectedly large values',
    buckets: [1, 7, 30, 90, 180, 365, 730, 1825],
    registers: [registry],
  });
  return {
    billingTransactionsTotal,
    billingTransactionAmount,
    projectsTotal,
    emailSentTotal,
    mqttServersTotal,
    mqttServersHealthy,
    pluginsLoaded,
    companionDownloadsTotal,
    authorizationCacheRequestsTotal,
    authorizationCacheSize,
    maintenanceUsageQueryWindowDays,
  };
}
