import { ConflictException } from '@nestjs/common';
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import type { WagoCommissioningPreflightReport } from '../shared/commissioning';

/** Read-only admission checks. Active CODESYS and register permissions are resolved by preparation. */
export function controllerPreparationBlockers(report: WagoCommissioningPreflightReport): string[] {
  const blockers: string[] = [];
  if (report.platform === 'unsupported-firmware')
    blockers.push('The controller is not a supported CC100 751-9301 running firmware 31.');
  if (report.hardware === 'missing-register')
    blockers.push('The required onboard digital input or output register is missing.');
  if (report.hardware === 'permission-tool-unavailable')
    blockers.push('The controller has no working setpriv/capsh tool for verifying runtime permissions.');
  if (report.docker === 'vendor-package-missing')
    blockers.push('The firmware-installed docker/dockerd binaries are missing.');
  else if (report.docker === 'unsupported-tool-state')
    blockers.push('The vendor Docker installation is incomplete or its daemon state cannot be verified.');
  if (report.configDocker === 'missing') blockers.push('The firmware tool /etc/config-tools/config_docker is missing.');
  if (
    report.provision &&
    !['prepare-controller', 'install-vendor-runtime', 'review-start-installed-runtime'].includes(report.provision)
  )
    blockers.push('The firmware lifecycle tools do not support automatic controller preparation.');
  if (report.exclusivity === 'output-container-conflict')
    blockers.push('Another Docker container has access to the onboard outputs.');
  return blockers;
}

/** Validate only the broker address used to construct the controller runtime URL. */
export function assertCommissioningBroker(config: MqttServerConnectionConfig): void {
  if (!/^[a-zA-Z0-9.-]+$/.test(config.host) || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new ConflictException('Configure a valid MQTT hostname and port before commissioning.');
}
