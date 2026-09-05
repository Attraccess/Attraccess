// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModbusConfigurationForm } from './ModbusConfigurationForm';
import type { ModbusConfiguration } from '../../modbus/model';

afterEach(cleanup);
describe('Modbus custom profile editing', () => {
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
