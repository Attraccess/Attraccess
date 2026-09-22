import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { PropertyInput, type Property } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 } }),
}));
vi.mock('../../../../../../../components/mqttServerSelect', () => ({ MqttServerSelect: () => null }));
vi.mock('../../../../../../../components/companionDeviceSelect', () => ({ CompanionDeviceSelect: () => null }));
vi.mock('../../../../../../mqtt/servers/CreateMqttServerPage', () => ({ CreateMqttServerForm: () => null }));
afterEach(cleanup);

function Editor({ schema, initial }: { schema: Property<unknown>; initial: unknown }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PropertyInput
        nodeType="input.button"
        name="value"
        schema={schema}
        value={value}
        onChange={setValue}
        tNodeTranslations={(key) => (key.endsWith('.add') ? 'Add' : key)}
        isRequired={false}
      />
      <output aria-label="Saved value">{JSON.stringify(value)}</output>
    </>
  );
}

it('edits nested object properties without dropping sibling values', async () => {
  const user = userEvent.setup();
  render(
    <Editor
      schema={{
        type: 'object',
        title: 'Details',
        properties: { name: { type: 'string', title: 'Name' }, enabled: { type: 'boolean', title: 'Enabled' } },
        required: ['name'],
      }}
      initial={{ name: 'old', enabled: true }}
    />,
  );
  const name = screen.getByRole('textbox', { name: 'Name' });
  await user.clear(name);
  await user.type(name, 'new');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('{"name":"new","enabled":true}');
});

it('adds, edits, and removes dictionary entries', async () => {
  const user = userEvent.setup();
  render(
    <Editor schema={{ type: 'object', title: 'Headers', additionalProperties: { type: 'string' } }} initial={{}} />,
  );
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await user.type(screen.getByPlaceholderText('Header name'), 'X-Device');
  await user.type(screen.getByPlaceholderText('Header value'), 'cc100');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('{"X-Device":"cc100"}');
  await user.click(screen.getByRole('button', { name: '' }));
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('{}');
});

it('renames dictionary entries in place without moving focus to a sibling', async () => {
  const user = userEvent.setup();
  render(
    <Editor
      schema={{ type: 'object', title: 'Headers', additionalProperties: { type: 'string' } }}
      initial={{ First: 'one', Second: 'two' }}
    />,
  );
  const [firstHeader, secondHeader] = screen.getAllByPlaceholderText('Header name');
  await user.clear(firstHeader);
  await user.type(firstHeader, 'X-First');
  expect(firstHeader).toHaveFocus();
  expect(firstHeader).toHaveValue('X-First');
  expect(secondHeader).toHaveValue('Second');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('{"X-First":"one","Second":"two"}');
});

it('rejects dictionary key renames that would overwrite a sibling value', () => {
  render(
    <Editor
      schema={{ type: 'object', title: 'Headers', additionalProperties: { type: 'string' } }}
      initial={{ First: 'one', Second: 'two' }}
    />,
  );
  const [firstHeader] = screen.getAllByPlaceholderText('Header name');
  fireEvent.change(firstHeader, { target: { value: 'Second' } });
  expect(firstHeader).toHaveValue('First');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('{"First":"one","Second":"two"}');
});

it('initializes object array defaults and edits row properties', async () => {
  const user = userEvent.setup();
  render(
    <Editor
      schema={{
        type: 'array',
        title: 'Rows',
        items: {
          type: 'object',
          properties: { name: { type: 'string', title: 'Name', default: 'initial' } },
          required: ['name'],
        },
      }}
      initial={[]}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Add' }));
  const name = screen.getByPlaceholderText('Name');
  expect(name).toHaveValue('initial');
  await user.clear(name);
  await user.type(name, 'updated');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('[{"name":"updated"}]');
});

it('edits primitive array items and removes rows', async () => {
  const user = userEvent.setup();
  render(<Editor schema={{ type: 'array', title: 'Names', items: { type: 'string' } }} initial={['first']} />);
  const field = screen.getByRole('textbox');
  await user.clear(field);
  await user.type(field, 'second');
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('["second"]');
  await user.click(screen.getByRole('button', { name: '' }));
  expect(screen.getByLabelText('Saved value')).toHaveTextContent('[]');
});
