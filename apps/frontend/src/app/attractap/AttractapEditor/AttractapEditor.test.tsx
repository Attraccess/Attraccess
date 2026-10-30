import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttractapEditor } from './AttractapEditor';

const state = vi.hoisted(() => ({ reader: undefined as unknown }));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetReaderById: () => ({ data: state.reader }),
  useAttractapServiceGetReadersKey: 'readers',
  useAttractapServiceUpdateReader: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
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
