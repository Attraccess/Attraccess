import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapEditor } from './AttractapEditor';

const state = vi.hoisted(() => ({
  reader: undefined as unknown,
  mutate: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useGetReaderById: () => ({ data: state.reader }),
  useGetReadersKey: 'readers',
  UseGetReaderByIdKeyFn: () => ['reader'],
  useUpdateReader: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  ResourceSelector: () => null,
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../components/standardDrawer', () => ({
  StandardDrawer: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@heroui/react')>()),
  DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('../pairing/ReaderSecurity', () => ({ ReaderSecurity: () => <div data-testid="reader-security" /> }));

describe('AttractapEditor security tab', () => {
  beforeEach(() => {
    state.reader = undefined;
    state.mutate = vi.fn();
  });

  it('hides the Security tab while there is no reader', () => {
    render(<AttractapEditor isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'tabs.general' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'tabs.security' })).toBeNull();
  });

  it('shows the Security tab for an existing reader', () => {
    state.reader = { id: 1, name: 'Door', ledBrightness: 255, resources: [], firmware: { capabilities: {} } };
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'tabs.security' })).toBeInTheDocument();
  });
});

describe('AttractapEditor plugin Bluetooth opt-in', () => {
  const reader = (allowPluginBle?: boolean) => ({
    id: 1,
    name: 'Door',
    ledBrightness: 255,
    allowPluginBle,
    resources: [],
    firmware: { capabilities: {} },
  });

  beforeEach(() => {
    state.mutate = vi.fn();
  });

  it('is off by default', () => {
    state.reader = reader(undefined);
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'allowPluginBle' })).not.toBeChecked();
    expect(screen.getByText('allowPluginBleDescription')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'allowPluginBle' })).toHaveAccessibleDescription(
      'allowPluginBleDescription',
    );
  });

  it('shows the saved value', () => {
    state.reader = reader(true);
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'allowPluginBle' })).toBeChecked();
  });

  it('saves the switch through the reader update', () => {
    state.reader = reader(false);
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'allowPluginBle' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(state.mutate).toHaveBeenCalledWith({
      path: { readerId: 1 },
      body: expect.objectContaining({ name: 'Door', allowPluginBle: true }),
    });
  });

  it('does not send the opt-in on a name-only save', () => {
    state.reader = reader(true);
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('enterReaderName'), { target: { value: 'Front door' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    const [{ body }] = state.mutate.mock.calls[0];
    expect(body).toEqual(expect.objectContaining({ name: 'Front door' }));
    expect(body).not.toHaveProperty('allowPluginBle');
  });
});

describe('AttractapEditor for a BLE Bridge', () => {
  const reader = (capabilities: Record<string, unknown>) => ({
    id: 1,
    name: 'Bridge',
    ledBrightness: 255,
    allowPluginBle: true,
    resources: [],
    firmware: { capabilities: { hasLeds: true, ...capabilities } },
  });

  beforeEach(() => {
    state.mutate = vi.fn();
  });

  it('hides resources, reader display and LED settings, and keeps name, plugin Bluetooth and pairing', () => {
    state.reader = reader({ nfc: false });
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'tabs.resources' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'tabs.readerUi' })).toBeNull();
    expect(screen.queryByText('ledBrightness')).toBeNull();
    expect(screen.getByText('bleBridgeDescription')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('enterReaderName')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'allowPluginBle' })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'tabs.security' })).toBeInTheDocument();
  });

  it('saves only the bridge settings', () => {
    state.reader = reader({ nfc: false });
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    const [{ requestBody }] = state.mutate.mock.calls[0];
    expect(requestBody).toEqual({ name: 'Bridge', connectedResourceIds: [] });
  });

  it.each([
    ['reports NFC', { nfc: true }],
    ['predates the nfc capability', {}],
  ])('shows every setting for a reader that %s', (_name, capabilities) => {
    state.reader = reader(capabilities);
    render(<AttractapEditor readerId={1} isOpen onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'tabs.resources' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'tabs.readerUi' })).toBeInTheDocument();
    expect(screen.getByText('ledBrightness')).toBeInTheDocument();
    expect(screen.queryByText('bleBridgeDescription')).toBeNull();
  });
});
