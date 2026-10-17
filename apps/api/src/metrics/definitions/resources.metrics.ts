import { Counter, Gauge, Histogram, Registry } from 'prom-client';
export function createResourcesMetrics(registry: Registry) {
  const resourcesTotal = new Gauge({
    name: 'attraccess_resources_total',
    help: 'Total number of resources',
    registers: [registry],
  });

  const resourceUsageSessionsActive = new Gauge({
    name: 'attraccess_resource_usage_sessions_active',
    help: 'Number of active resource usage sessions',
    registers: [registry],
  });

  const resourceUsageSessionsTotal = new Counter({
    name: 'attraccess_resource_usage_sessions_total',
    help: 'Total number of resource usage sessions',
    labelNames: ['action'],
    registers: [registry],
  });

  const resourceUsageDurationSeconds = new Histogram({
    name: 'attraccess_resource_usage_duration_seconds',
    help: 'Duration of resource usage sessions in seconds',
    buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
    registers: [registry],
  });

  const resourceGroupsTotal = new Gauge({
    name: 'attraccess_resource_groups_total',
    help: 'Total number of resource groups',
    registers: [registry],
  });

  const resourceIntroductionsTotal = new Counter({
    name: 'attraccess_resource_introductions_total',
    help: 'Total number of resource introductions completed',
    registers: [registry],
  });

  const resourceMaintenanceTotal = new Counter({
    name: 'attraccess_resource_maintenance_total',
    help: 'Total number of maintenance events',
    labelNames: ['type'],
    registers: [registry],
  });

  const resourceMaintenanceOverdue = new Gauge({
    name: 'attraccess_resource_maintenance_overdue',
    help: 'Number of resources with overdue maintenance',
    registers: [registry],
  });
  return {
    resourcesTotal,
    resourceUsageSessionsActive,
    resourceUsageSessionsTotal,
    resourceUsageDurationSeconds,
    resourceGroupsTotal,
    resourceIntroductionsTotal,
    resourceMaintenanceTotal,
    resourceMaintenanceOverdue,
  };
}
