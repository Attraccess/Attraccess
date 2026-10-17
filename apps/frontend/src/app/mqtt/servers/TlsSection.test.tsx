import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { CreateMqttServerDto } from '@attraccess/react-query-client';
import { TlsSection } from './TlsSection';
afterEach(cleanup);
function Fixture() {
  const [values, setValues] = useState<CreateMqttServerDto>({
    name: 'Broker',
    host: 'broker.example.test',
    port: 8883,
    useTls: false,
  });
  return (
    <>
      <TlsSection
        values={values}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        t={(key) => key}
        dataCyPrefix="mqtt"
      />
      <output>{JSON.stringify(values)}</output>
    </>
  );
}
it('configures TLS certificates and server name, warns about disabled verification and retains drafts while toggling TLS', () => {
  render(<Fixture />);
  expect(screen.queryByLabelText('caCertLabel')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'useTls' }));
  fireEvent.change(screen.getByLabelText('caCertLabel'), { target: { value: 'certificate' } });
  fireEvent.change(screen.getByLabelText('tlsServernameLabel'), { target: { value: 'broker.example.test' } });
  expect(screen.queryByText('tlsInsecureWarning')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'tlsInsecureLabel' }));
  expect(screen.getByText('tlsInsecureWarningTitle')).toBeTruthy();
  expect(screen.getByText('tlsInsecureWarning')).toBeTruthy();
  expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({
    name: 'Broker',
    host: 'broker.example.test',
    port: 8883,
    useTls: true,
    caCert: 'certificate',
    tlsServername: 'broker.example.test',
    tlsInsecure: true,
  });
  fireEvent.click(screen.getByRole('switch', { name: 'useTls' }));
  expect(screen.queryByLabelText('caCertLabel')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: 'useTls' }));
  expect(screen.getByLabelText('caCertLabel')).toHaveValue('certificate');
  expect(screen.getByLabelText('tlsServernameLabel')).toHaveValue('broker.example.test');
});
