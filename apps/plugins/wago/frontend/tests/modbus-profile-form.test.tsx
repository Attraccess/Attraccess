// Covers the Modbus profile form that the front panel's device dialog embeds for custom devices.
// FEATURE: custom Modbus register maps are edited field by field; the dialog never renders built-in maps here.
// These forms were once exercised through the removed configuration editor.
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModbusProfile } from '../../modbus/model';
import { ModbusProfileForm } from '../src/configuration/modbus/ModbusProfileForm';

const format = {
  address: 4,
  addressBase: 0,
  dataType: 'uint16',
  byteOrder: 'big',
  wordOrder: 'big',
  scale: 1,
  offset: 0,
} as const;
const custom: ModbusProfile = {
  id: 'custom-meter',
  name: 'Boiler meter',
  version: 1,
  measurements: [
    { ...format, id: 'temp', name: 'Boiler temp', functionCode: 3, unit: 'watt', kind: 'live', pollIntervalMs: 5000 },
  ],
  actions: [{ ...format, id: 'switch', name: 'Burner', functionCode: 5, onValue: 1, offValue: 0 }],
};

let latest: ModbusProfile;
function Harness({ initial = custom }: { initial?: ModbusProfile }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return <ModbusProfileForm value={value} onChange={setValue} />;
}
/** Text entry without per-key events: the form's own change handling is what is under test. */
const set = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
/** Signals render collapsed in the front panel, so a test opens a signal's disclosure before editing inside it. */
const openPanel = (title: string) => {
  const details = screen.getByText(title).closest('details') as HTMLElement;
  fireEvent.click(within(details).getByText(title));
  fireEvent(details, new Event('toggle'));
  return within(details);
};
const measurementPanel = () => openPanel('Measurement: Boiler temp');
const actionPanel = () => openPanel('Action: Burner');

beforeEach(() => {
  useTranslationState.getState().setLanguage('en');
});
afterEach(cleanup);

describe('custom profile', () => {
  it('edits the profile name and version while keeping incomplete numeric text', async () => {
    render(<Harness />);
    set(screen.getByLabelText('Profile name'), 'Boiler');
    const version = screen.getByLabelText('Version');
    set(version, '');
    expect(latest.version).toBeNaN();
    expect(version.getAttribute('aria-invalid')).toBe('true');
    set(version, '3');
    expect(latest).toMatchObject({ name: 'Boiler', version: 3 });
    expect(version.getAttribute('aria-invalid')).toBeNull();
    // Incomplete text that still parses to the stored number stays as typed.
    set(version, '3.');
    expect((version as HTMLInputElement).value).toBe('3.');
    expect(latest.version).toBe(3);
  });

  it('edits a measurement: name, register address, scale, offset and polling interval', () => {
    render(<Harness />);
    const panel = measurementPanel();
    set(panel.getByLabelText('Name'), 'Flow temp');
    set(panel.getByLabelText('Register address (decimal)'), '40');
    set(panel.getByLabelText('scale'), '0.1');
    set(panel.getByLabelText('offset'), '-2');
    set(panel.getByLabelText('Polling interval (ms)'), '1000');
    expect(latest.measurements[0]).toMatchObject({
      name: 'Flow temp',
      address: 40,
      scale: 0.1,
      offset: -2,
      pollIntervalMs: 1000,
    });
  });

  it('edits how a measurement register is read: data type, byte and word order, address convention', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = measurementPanel();
    await user.click(panel.getByRole('button', { name: /Data type/ }));
    await user.click(await screen.findByRole('option', { name: 'float32' }));
    await user.click(panel.getByRole('button', { name: /Byte order/ }));
    await user.click(await screen.findByRole('option', { name: 'little' }));
    await user.click(panel.getByRole('button', { name: /Word order/ }));
    await user.click(await screen.findByRole('option', { name: 'little' }));
    await user.click(panel.getByRole('button', { name: /Address convention/ }));
    await user.click(await screen.findByRole('option', { name: '1' }));
    expect(latest.measurements[0]).toMatchObject({
      dataType: 'float32',
      byteOrder: 'little',
      wordOrder: 'little',
      addressBase: 1,
    });
  });

  it('edits what a measurement means: unit, precision, number encoding and read function', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = measurementPanel();
    await user.click(panel.getByRole('button', { name: /Physical unit/ }));
    await user.click(await screen.findByRole('option', { name: 'volt' }));
    await user.click(panel.getByRole('button', { name: /Reading precision/ }));
    await user.click(await screen.findByRole('option', { name: '0.1 units' }));
    await user.click(panel.getByRole('button', { name: /Number encoding/ }));
    await user.click(await screen.findByRole('option', { name: 'packed decimal (BCD)' }));
    await user.click(panel.getByRole('button', { name: /Read function/ }));
    await user.click(await screen.findByRole('option', { name: '4' }));
    expect(latest.measurements[0]).toMatchObject({ unit: 'volt', decimalPlaces: 1, encoding: 'bcd', functionCode: 4 });
  });

  it('asks for a rollover only for cumulative readings and clears it again for live ones', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = measurementPanel();
    expect(panel.queryByLabelText(/Documented raw rollover modulus/)).toBeNull();
    await user.click(panel.getByRole('button', { name: /Measurement kind/ }));
    await user.click(await screen.findByRole('option', { name: 'cumulative' }));
    const rollover = panel.getByLabelText(/Documented raw rollover modulus/);
    set(rollover, '65536');
    expect(latest.measurements[0]).toMatchObject({ kind: 'cumulative', rollover: 65536 });
    set(rollover, '');
    expect(latest.measurements[0].rollover).toBeUndefined();
    set(rollover, '99');
    await user.click(panel.getByRole('button', { name: /Measurement kind/ }));
    await user.click(await screen.findByRole('option', { name: 'live' }));
    expect(latest.measurements[0]).toMatchObject({ kind: 'live', rollover: undefined });
    expect(panel.queryByLabelText(/Documented raw rollover modulus/)).toBeNull();
    await user.click(panel.getByRole('button', { name: /Reading precision/ }));
    await user.click(await screen.findByRole('option', { name: 'Whole units' }));
    await user.click(panel.getByRole('button', { name: /Reading precision/ }));
    await user.click(await screen.findByRole('option', { name: 'Exact (no rounding)' }));
    expect(latest.measurements[0].decimalPlaces).toBeUndefined();
  });

  it('edits an action: name, write function, register format and switch values', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = actionPanel();
    set(panel.getByLabelText('Name'), 'Pump');
    await user.click(panel.getByRole('button', { name: /Write function/ }));
    await user.click(await screen.findByRole('option', { name: '16' }));
    await user.clear(panel.getByLabelText('On value (physical units)'));
    await user.type(panel.getByLabelText('On value (physical units)'), '255');
    await user.clear(panel.getByLabelText('Off value (physical units)'));
    await user.type(panel.getByLabelText('Off value (physical units)'), '2');
    expect(latest.actions[0]).toMatchObject({ name: 'Pump', functionCode: 16, onValue: 255, offValue: 2 });
  });

  it('adds and removes measurements and actions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add measurement' }));
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    expect(latest.measurements).toHaveLength(2);
    expect(latest.measurements[1]).toMatchObject({
      name: 'Measurement',
      functionCode: 3,
      unit: 'watt',
      pollIntervalMs: 5000,
    });
    expect(latest.actions).toHaveLength(2);
    expect(latest.actions[1]).toMatchObject({ name: 'Switch', functionCode: 5, onValue: 1, offValue: 0 });
    measurementPanel();
    await user.click(screen.getAllByRole('button', { name: 'Remove measurement' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Remove action' })[0]);
    expect(latest.measurements.map((m) => m.name)).toEqual(['Measurement']);
    expect(latest.actions.map((a) => a.name)).toEqual(['Switch']);
  });

  it('collapses every signal until it is opened', () => {
    const many = {
      ...custom,
      measurements: Array.from({ length: 20 }, (_, i) => ({
        ...custom.measurements[0],
        id: `m${i}`,
        name: `Reading ${i}`,
      })),
    };
    const { container } = render(<Harness initial={many} />);
    const details = [...container.querySelectorAll('details')];
    expect(details).toHaveLength(21);
    expect(details.every((d) => !d.open)).toBe(true);
  });

  it('shows the custom-profile hint and no identifier fields', () => {
    render(<Harness />);
    expect(screen.queryByText(/Read-only profile/)).toBeNull();
    expect(screen.queryByLabelText('Profile ID')).toBeNull();
    const panel = measurementPanel();
    expect(panel.queryByLabelText('Measurement ID')).toBeNull();
    expect(actionPanel().queryByLabelText('Action ID')).toBeNull();
  });
});
