import { expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { validateEditorSnapshot } from '../../backend/configuration-editor';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import type { ModbusOutputAndSerialCompositionTestScope } from './visual-editor.test';
export function registerBindsANamedActionAndLiveMeasurementRetainingOutputControlsAndValidMeteredPayloads(
  scope: ModbusOutputAndSerialCompositionTestScope,
): void {
  it('binds a named action and live measurement, retaining output controls and valid metered payloads', async () => {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'fixture-map');
    profile.actions = [
      {
        id: 'switch',
        name: 'Relay',
        functionCode: 5,
        address: 0,
        addressBase: 0,
        dataType: 'uint16',
        byteOrder: 'big',
        wordOrder: 'big',
        scale: 1,
        offset: 0,
        onValue: 1,
        offValue: 0,
      },
    ];
    const snapshot = {
      ...scope.state.snapshot,
      modbus: {
        profiles: [profile],
        connections: [
          {
            id: 'connection',
            transport: 'tcp',
            host: 'meter.fixture.invalid',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 250,
            queueLimit: 16,
          },
        ],
        devices: [
          {
            id: 'meter',
            name: 'Meter',
            connectionId: 'connection',
            unitId: 1,
            profileId: profile.id,
            profileVersion: 1,
          },
        ],
      },
    };
    scope.state.getDraft.mockResolvedValue({
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: 'initial',
    });
    scope.mount();
    const user = userEvent.setup();
    await scope.external(user, 'Devices');
    await user.click(await screen.findByRole('button', { name: 'Add Relay from Meter' }));
    await scope.section(user, 'Channels');
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Active power/ }));
    await user.click(screen.getByRole('button', { name: /Output behavior/ }));
    await user.click(await screen.findByRole('option', { name: /Pulsed —/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(1));
    const [, saved] = scope.state.save.mock.calls[0];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.modbus).toEqual(snapshot.modbus);
    expect(saved.physicalPoints[1].modbus).toEqual({
      deviceId: 'meter',
      actionId: 'switch',
      measurementId: 'active-power',
    });
    expect(saved.logicalChannels[1]).toMatchObject({
      profile: 'metered-switched-load',
      capabilities: ['output', 'measurement', 'pulse'],
      pulse: { durationMs: 500 },
      disconnectPolicy: { mode: 'immediate' },
    });
    await user.click(screen.getByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Pulse duration (ms)' })).toHaveValue(500);
    await user.click(screen.getByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'Relay' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(scope.state.save).toHaveBeenCalledTimes(2));
    expect(scope.state.save.mock.calls[1][1]).toEqual(saved);
  });
}
