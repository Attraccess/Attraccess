// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModbusConfigurationForm } from './ModbusConfigurationForm';
import { BUILTIN_MODBUS_PROFILES, type ModbusConfiguration } from '../../modbus/model';

afterEach(cleanup);
describe('Modbus custom profile editing', () => {
  it('edits only the selected profile during a temporary ID collision', async () => {
    const other = { id: 'other', name: 'Other profile', version: 2, measurements: [], actions: [] };
    const initial: ModbusConfiguration = {
      connections: [],
      devices: [],
      profiles: [{ id: 'custom', name: 'Custom', version: 1, measurements: [], actions: [] }, other],
    };
    let latest = initial;
    function Editor() {
      const [value, onChange] = useState(initial);
      latest = value;
      return <ModbusConfigurationForm value={value} onChange={onChange} />;
    }
    render(<Editor />);
    const user = userEvent.setup();
    const id = screen.getByDisplayValue('custom');
    await user.clear(id);
    await user.type(id, 'other');
    expect(screen.getByRole('alert')).toHaveTextContent('unique non-empty ID required');
    const name = screen.getByDisplayValue('Custom');
    await user.clear(name);
    await user.type(name, 'Renamed');
    expect(latest.profiles[0]).toMatchObject({ id: 'other', name: 'Renamed', version: 1 });
    expect(latest.profiles[1]).toBe(other);
    expect(screen.getByDisplayValue('Other profile')).toBeInTheDocument();
  });
  it('allows repairing a built-in ID collision while actual built-in profiles remain read-only', async () => {
    function Editor() {
      const [value, onChange] = useState<ModbusConfiguration>({
        connections: [],
        devices: [],
        profiles: [{ id: 'custom', name: 'Custom', version: 1, measurements: [], actions: [] }],
      });
      return <ModbusConfigurationForm value={value} onChange={onChange} />;
    }
    render(<Editor />);
    const user = userEvent.setup();
    const builtin = BUILTIN_MODBUS_PROFILES[0];
    const builtinId = screen.getByDisplayValue(builtin.id);
    const builtinName = screen.getByDisplayValue(builtin.name);
    const id = screen.getByDisplayValue('custom');
    await user.clear(id);
    await user.type(id, builtin.id);
    expect(id).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('built-ins are immutable');
    const name = screen.getByDisplayValue('Custom');
    await user.clear(name);
    await user.type(name, 'Renamed');
    expect(name).toHaveValue('Renamed');
    expect(builtinId).toBeDisabled();
    expect(builtinName).toBeDisabled();
    expect(builtinName).toHaveValue(builtin.name);
    expect(Object.isFrozen(builtin)).toBe(true);
    await user.clear(id);
    await user.type(id, 'repaired');
    expect(id).toHaveValue('repaired');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('keeps the input mounted and focused throughout a multi-character ID edit', async () => {
    function Editor() {
      const [value, onChange] = useState<ModbusConfiguration>({
        connections: [],
        devices: [],
        profiles: [{ id: 'custom', name: 'Custom', version: 1, measurements: [], actions: [] }],
      });
      return <ModbusConfigurationForm value={value} onChange={onChange} />;
    }
    render(<Editor />);
    const user = userEvent.setup();
    const input = screen.getByDisplayValue('custom');
    await user.click(input);
    await user.keyboard('-edited');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('custom-edited');
    expect(screen.getByDisplayValue('custom-edited')).toBe(input);
  });
});

it('keeps partial numeric text while typing and replaces it when the authoritative value changes', async () => {
  let replace!: (value: ModbusConfiguration) => void;
  const initial: ModbusConfiguration = {
    connections: [
      {
        id: 'bus',
        transport: 'tcp',
        host: 'meter.fixture.invalid',
        port: 502,
        timeoutMs: 1000,
        reconnectMs: 250,
        queueLimit: 16,
      },
    ],
    devices: [],
    profiles: [],
  };
  function Editor() {
    const [value, setValue] = useState(initial);
    replace = setValue;
    return <ModbusConfigurationForm value={value} onChange={setValue} collapseProfiles />;
  }
  render(<Editor />);
  const user = userEvent.setup();
  const port = screen.getByRole('textbox', { name: 'Port' });
  await user.clear(port);
  await user.type(port, '0502.');
  expect(port).toHaveValue('0502.');
  await act(async () => {
    replace({
      ...initial,
      connections: [
        {
          id: 'bus',
          transport: 'tcp',
          host: 'meter.fixture.invalid',
          port: 1502,
          timeoutMs: 1000,
          reconnectMs: 250,
          queueLimit: 16,
        },
      ],
    });
  });
  expect(port).toHaveFocus();
  expect(port).toHaveValue('1502');
  await user.keyboard('{End}0');
  expect(port).toHaveValue('15020');
});
