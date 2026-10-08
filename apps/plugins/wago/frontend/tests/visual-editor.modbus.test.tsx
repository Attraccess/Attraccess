// Register API mocks before the editor and its fixture helpers are imported.
import { state } from './visual-editor.test.state';
import { PluginLiveUpdatesProvider, type PluginLiveUpdatesClient } from '@attraccess/plugins-frontend-sdk';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateEditorSnapshot } from '../../backend/configuration/editor';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import type { WagoConfigurationSnapshot } from '../src/api/client';
import { ConfigurationEditor } from '../src/configuration/ConfigurationEditor';
import { diagnosticsFixture, resetTestFixture } from './visual-editor.setup.test-fixture.helpers';
import { external, section } from './visual-editor.test.external.helpers';

let client: QueryClient;

function mount(liveClient: PluginLiveUpdatesClient | null = null) {
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PluginLiveUpdatesProvider client={liveClient}>
        <ConfigurationEditor controllerId={1} onOpenChange={close} />
      </PluginLiveUpdatesProvider>
    </QueryClientProvider>,
  );
  return close;
}

function getSetupScope() {
  return {
    get state() {
      return state;
    },
    get client() {
      return client;
    },
    set client(value: typeof client) {
      client = value;
    },
    diagnosticsFixture,
  };
}

const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');

beforeAll(() => {
  // JSDOM has no layout scrolling; React Aria calls this when opening a collection.
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalScrollTo) Object.defineProperty(Element.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(Element.prototype, 'scrollTo');
});

beforeEach(() => {
  resetTestFixture(getSetupScope());
});

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  client.clear();
  vi.unstubAllGlobals();
});

describe('mounted Modbus configuration', () => {
  async function addMeter() {
    mount();
    const user = userEvent.setup();
    await external(user, 'Connections');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Host' }), 'meter.fixture.invalid');
    await external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    await user.clear(screen.getByRole('textbox', { name: 'Device name' }));
    await user.type(screen.getByRole('textbox', { name: 'Device name' }), 'Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Add Active power from Workshop meter' }));
    await section(user, 'Channels');
    return user;
  }

  it('mounts named bindings and saves exact Modbus configuration with stable identities', async () => {
    const user = await addMeter();
    expect(screen.queryByRole('textbox', { name: 'Device ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Connection ID' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modbus device/ })).toHaveTextContent('Workshop meter');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, first] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(first)).toEqual([]);
    expect(first.modbus.devices[0]).toMatchObject({
      name: 'Workshop meter',
      profileId: 'wago-879-3020',
      profileVersion: 1,
    });
    expect(first.physicalPoints[1]).toMatchObject({
      hardwareProfile: 'modbus',
      channel: 0,
      modbus: { deviceId: first.modbus.devices[0].id, measurementId: 'active-power' },
    });
    expect(first.logicalChannels[1]).toMatchObject({
      physicalPointId: first.physicalPoints[1].id,
      capabilities: ['input', 'measurement'],
      measurement: { unit: 'watt', kind: 'live', scale: 1, offset: 0 },
    });
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    const [, second] = state.save.mock.calls[1];
    expect(second.physicalPoints[1].id).toBe(first.physicalPoints[1].id);
    expect(second.logicalChannels[1].id).toBe(first.logicalChannels[1].id);
    expect(second.physicalPoints[1].modbus.measurementId).toBe('import-energy');
    expect(second.logicalChannels[1].measurement).toEqual({
      unit: 'watt-hour',
      kind: 'cumulative',
      scale: 1,
      offset: 0,
    });
    expect(second.logicalChannels[0]).toEqual(first.logicalChannels[0]);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it('blocks invalid transport and binding edits and displays server validation', async () => {
    const user = await addMeter();
    await external(user, 'Connections');
    const port = screen.getByRole('textbox', { name: 'Port' });
    await user.clear(port);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.type(port, '502');
    state.validate.mockResolvedValue({
      valid: false,
      errors: [{ path: 'modbus.devices[0].unitId', code: 'invalid_modbus', message: 'Fixture unit is unavailable' }],
    });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText('Workshop meter · Unit ID (1–247): Fixture unit is unavailable'),
    ).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    await external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText(/existing device and named measurement\/action required/)).toBeInTheDocument();
  });

  it('freezes Modbus controls and rejects saving a dirty editor over a refreshed draft', async () => {
    const user = await addMeter();
    await external(user, 'Connections');
    const fresh = {
      controllerId: 1,
      snapshot: JSON.stringify(state.snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: '2026-09-07',
    };
    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], fresh);
    });
    expect(await screen.findByText('Saved draft changed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(state.save).not.toHaveBeenCalled();
  });
});

describe('Modbus output and serial composition', () => {
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
      ...state.snapshot,
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
    state.getDraft.mockResolvedValue({
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      presetProvenance: null,
      reviewedHash: null,
      updatedAt: 'initial',
    });
    mount();
    const user = userEvent.setup();
    await external(user, 'Devices');
    await user.click(await screen.findByRole('button', { name: 'Add Relay from Meter' }));
    await section(user, 'Channels');
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /Active power/ }));
    await user.click(screen.getByRole('button', { name: /Output behavior/ }));
    await user.click(await screen.findByRole('option', { name: /Pulsed —/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, saved] = state.save.mock.calls[0];
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
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][1]).toEqual(saved);
  });

  it('uses the actual transport selector to replace TCP fields with valid serial configuration', async () => {
    mount();
    const user = userEvent.setup();
    await external(user, 'Connections');
    await user.click(await screen.findByRole('button', { name: 'Add connection' }));
    await user.click(screen.getByRole('button', { name: /Transport/ }));
    await user.click(await screen.findByRole('option', { name: 'rtu' }));
    expect(screen.queryByRole('textbox', { name: 'Host' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const [, saved] = state.save.mock.calls[0];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.modbus.connections[0]).toMatchObject({
      transport: 'rtu',
      path: '/dev/serial',
      baudRate: 9600,
      parity: 'even',
      stopBits: 1,
    });
    expect(saved.modbus.connections[0]).not.toHaveProperty('host');
    expect(saved.modbus.connections[0]).not.toHaveProperty('port');
  });
});

describe('Modbus review regressions', () => {
  function fixture(orphan = false): WagoConfigurationSnapshot {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom-map');
    profile.name = 'Fixture map';
    profile.actions = [
      {
        id: 'relay',
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
    return {
      version: 1,
      modbus: {
        connections: [
          {
            id: 'bus',
            transport: 'tcp',
            host: 'old.fixture.invalid',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 250,
            queueLimit: 16,
          },
        ],
        devices: [
          { id: 'meter', name: 'Meter', connectionId: 'bus', unitId: 1, profileId: profile.id, profileVersion: 1 },
        ],
        profiles: [profile],
      },
      physicalPoints: [
        {
          id: 'meter-point',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'meter', measurementId: 'active-power' },
        },
      ],
      logicalChannels: orphan
        ? []
        : [
            {
              id: 'reading',
              physicalPointId: 'meter-point',
              profile: 'generic-monitored-input',
              capabilities: ['input', 'measurement'],
              measurement: { unit: 'watt', kind: 'live', scale: 1, offset: 0 },
              disconnectPolicy: { mode: 'watchdog', timeoutMs: 2345 },
              range: { minimum: 0, maximum: 1000 },
            },
          ],
    };
  }
  function draftRecord(snapshot: WagoConfigurationSnapshot, updatedAt = 'initial') {
    return {
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      presetProvenance: JSON.stringify({
        editor: { names: { 'meter-point': 'Spare meter point', reading: 'Meter reading' }, presets: [] },
      }),
      reviewedHash: null,
      updatedAt,
    };
  }
  function start(snapshot: WagoConfigurationSnapshot) {
    state.getDraft.mockResolvedValue(draftRecord(snapshot));
    // Exercise the full backend validator as a read-only oracle for the submitted candidate.
    state.validate.mockImplementation(async (_id, candidate) => {
      const errors = validateEditorSnapshot(candidate);
      return { valid: errors.length === 0, errors };
    });
    mount();
    return userEvent.setup();
  }

  it('replaces a clean focused host authoritatively before the next keystroke', async () => {
    const snapshot = fixture();
    const user = start(snapshot);
    await external(user, 'Connections');
    const host = await screen.findByRole('textbox', { name: 'Host' });
    await user.click(host);
    const refreshed = fixture();
    const connection = refreshed.modbus!.connections[0];
    if (connection.transport === 'tcp') connection.host = 'new.fixture.invalid';
    await act(async () => {
      client.setQueryData(['wago', 'configuration-draft', 1], draftRecord(refreshed, 'refreshed'));
    });
    expect(host).toHaveFocus();
    await waitFor(() => expect(host).toHaveValue('new.fixture.invalid'));
    await user.keyboard('{End}-edited');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].modbus.connections[0].host).toBe('new.fixture.invalid-edited');
  });

  it('converts a ranged measurement into a plain output without a hidden invalid range', async () => {
    const user = start(fixture());
    await user.click(await screen.findByRole('button', { name: /Named action/ }));
    await user.click(await screen.findByRole('option', { name: 'Relay' }));
    expect(screen.getByRole('spinbutton', { name: 'Maximum' })).toHaveValue(1000);
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: 'None' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    const saved = state.save.mock.calls[0][1];
    expect(validateEditorSnapshot(saved)).toEqual([]);
    expect(saved.logicalChannels[0]).toMatchObject({
      id: 'reading',
      physicalPointId: 'meter-point',
      profile: 'generic-digital-output',
      capabilities: ['output'],
    });
    expect(saved.logicalChannels[0]).not.toHaveProperty('range');
    expect(saved.logicalChannels[0]).not.toHaveProperty('measurement');
  });

  it('retains the customized input disconnect policy when selecting another measurement', async () => {
    const user = start(fixture());
    await user.click(await screen.findByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    expect(screen.getByRole('spinbutton', { name: 'Watchdog timeout (ms)' })).toHaveValue(2345);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].logicalChannels[0]).toMatchObject({
      id: 'reading',
      disconnectPolicy: { mode: 'watchdog', timeoutMs: 2345 },
      range: { minimum: 0, maximum: 1000 },
    });
  });

  it('exposes an orphan binding for repair after map deletion and release after device deletion', async () => {
    const user = start(fixture(true));
    await external(user, 'Device profiles');
    await user.click(screen.getByRole('button', { name: /Edit profile/ }));
    await user.click(await screen.findByRole('option', { name: 'Fixture map v1' }));
    await user.click(screen.getByText('Measurement: Active power', { selector: 'summary' }));
    await user.click(screen.getAllByRole('button', { name: 'Remove measurement' })[0]);
    await section(user, 'Channels');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Named measurement/ }));
    await user.click(await screen.findByRole('option', { name: /^Imported energy \(watt-hour\)$/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][1].physicalPoints[0]).toMatchObject({
      id: 'meter-point',
      modbus: { measurementId: 'import-energy' },
    });
    expect(state.save.mock.calls[0][1].logicalChannels).toEqual([]);
    await external(user, 'Devices');
    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await section(user, 'Channels');
    await user.click(screen.getByRole('button', { name: /Release Spare meter point/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][1].physicalPoints).toEqual([]);
  });
});
