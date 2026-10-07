import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { ConfigurationChanges } from './ConfigurationChanges';
import { emptyConfiguration } from './configuration-model';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import type { ModbusProfile } from '../../modbus/model';
import type { WagoConfigurationSnapshot } from './api';
import type { RootTestRegistrationsTestScope } from './i18n.test';
export function registerLocalizesBuiltInModbusReviewNamesWhilePreservingCustomNamesAndMetadataOverrides(
  _scope: RootTestRegistrationsTestScope,
): void {
  it('localizes built-in Modbus review names while preserving custom names and metadata overrides', () => {
    const builtin = BUILTIN_MODBUS_PROFILES[0];
    const custom = duplicateProfile(builtin, 'custom-meter');
    custom.name = builtin.name;
    const snapshotFor = (profile: ModbusProfile): WagoConfigurationSnapshot => ({
      ...emptyConfiguration,
      physicalPoints: [
        {
          id: 'meter-point',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'active-power', measurementId: profile.measurements[0].id },
        },
      ],
      modbus: {
        connections: [
          {
            id: 'bus',
            transport: 'tcp',
            host: '192.0.2.1',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 1000,
            queueLimit: 8,
          },
        ],
        devices: [
          {
            id: 'active-power',
            name: 'Meter.v1',
            connectionId: 'bus',
            unitId: 1,
            profileId: profile.id,
            profileVersion: 1,
          },
        ],
        profiles: [custom],
      },
    });
    const before = snapshotFor(builtin);
    const after = snapshotFor(custom);
    const changes = [
      { path: '$.modbus.devices[0].profileId', previous: builtin.id, current: custom.id },
      {
        path: '$.physicalPoints[0].modbus.measurementId',
        previous: builtin.measurements[0].id,
        current: custom.measurements[0].id,
      },
    ];
    const { rerender } = render(<ConfigurationChanges changes={changes} before={before} after={after} names={{}} />);
    expect(screen.getByText(`Before: ${builtin.name}`)).toBeTruthy();
    expect(screen.getByText(`After: ${custom.name}`)).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Vorher: WAGO 879-3020 (4PS) — Modbus RTU')).toBeTruthy();
    expect(screen.getByText('Vorher: Wirkleistung')).toBeTruthy();
    expect(screen.getByText(`Nachher: ${custom.name}`)).toBeTruthy();
    expect(screen.getByText('Nachher: Active power')).toBeTruthy();
    rerender(
      <ConfigurationChanges
        changes={[{ path: '$', previous: null, current: before }]}
        before={null}
        after={before}
        names={{}}
      />,
    );
    expect(screen.getByText(/^Nachher:/).textContent).toContain('Wirkleistung');
    expect(screen.getByText(/^Nachher:/).textContent).toContain('Meter.v1');
    const fullReview = screen.getByText(/^Nachher:/).textContent ?? '';
    expect(fullReview.match(/Name: active-power(?![-\w])/g)).toHaveLength(2);
    rerender(
      <ConfigurationChanges
        changes={[{ path: '$.modbus.profiles[0].measurements[0].id', previous: null, current: 'active-power' }]}
        before={null}
        after={before}
        names={{ 'active-power': 'Unrelated metadata alias' }}
      />,
    );
    expect(screen.getByText('Nachher: active-power')).toBeTruthy();
    rerender(
      <ConfigurationChanges
        changes={[{ path: '$', previous: null, current: after }]}
        before={null}
        after={after}
        names={{}}
      />,
    );
    expect(screen.getByText(/^Nachher:/).textContent).toContain('Active power');
    expect(screen.getByText(/^Nachher:/).textContent).not.toContain('Wirkleistung');
    rerender(
      <ConfigurationChanges
        changes={changes}
        before={before}
        after={after}
        names={{ [builtin.id]: 'My meter.v1', [builtin.measurements[0].id]: 'My power.v2' }}
      />,
    );
    expect(screen.getByText('Vorher: My meter.v1')).toBeTruthy();
    expect(screen.getByText('Vorher: My power.v2')).toBeTruthy();
  });
}
