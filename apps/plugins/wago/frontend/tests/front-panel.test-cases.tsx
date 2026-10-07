import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { FrontPanel } from '../src/front-panel/FrontPanel';
import type { FrontPanelTestScope } from './front-panel.test';
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useFrontPanel } from '../src/front-panel/useFrontPanel';
import { DIGITAL_TERMINALS } from '../../backend/configuration-digital';
import { updateTerminal } from '../src/front-panel/model';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { within } from '@testing-library/react';

export function registerCancelsANewDeviceWithoutChangingTheWorkingConfiguration(scope: FrontPanelTestScope): void {
  it('cancels a new device without changing the working configuration', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Modbus device' }, { timeout: 10000 }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    expect(scope.api.save).not.toHaveBeenCalled();
  });
}

export function registerCancelsApplyConfirmationWithoutPublishing(scope: FrontPanelTestScope): void {
  it('cancels apply confirmation without publishing', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review).not.toBeNull());
    act(() => result.current.cancelReview());
    expect(result.current.review).toBeNull();
    expect(scope.api.publish).not.toHaveBeenCalled();
  });
}

export function registerDiscardsPersistedDraftChangesBackToTheAppliedConfiguration(scope: FrontPanelTestScope): void {
  it('discards persisted draft changes back to the applied configuration', async () => {
    scope.api.getDraft.mockResolvedValue({
      ...scope.draft,
      snapshot: JSON.stringify({ ...scope.snapshot, logicalChannels: [] }),
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.dirty).toBe(true));
    act(() => result.current.discard());
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(scope.api.save).toHaveBeenCalledWith(
      1,
      scope.snapshot,
      { names: { output: 'Laser power' }, presets: [] },
      expect.objectContaining({ snapshot: JSON.stringify({ ...scope.snapshot, logicalChannels: [] }) }),
    );
    expect(scope.api.publish).not.toHaveBeenCalled();
  });
}

export function registerExposesAnInteractiveInputInversionSwitchInTheTerminalSettings(
  scope: FrontPanelTestScope,
): void {
  it('exposes an interactive input inversion switch in the terminal settings', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Configure DI1' }));
    const control = await screen.findByRole('switch', { name: 'Invert input' });
    fireEvent.click(control);
    expect(control).toHaveProperty('checked', true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Door contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to controller' }));
    await waitFor(() =>
      expect(scope.api.save).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          logicalChannels: expect.arrayContaining([expect.objectContaining({ invert: true })]),
        }),
        expect.anything(),
        scope.draft,
      ),
    );
  });
}

export function registerExposesAnInteractiveOutputSwitchAndSendsAManualCommandWhenClicked(
  scope: FrontPanelTestScope,
): void {
  it('exposes an interactive output switch and sends a manual command when clicked', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    const control = await screen.findByRole('switch', { name: 'Switch DO1 Laser power' });
    await waitFor(() => expect(control.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(control);
    await waitFor(() =>
      expect(scope.api.manual).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ channelId: 'output', action: 'set', value: true, expectedConfigurationRevision: 7 }),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
}

export function registerKeepsLiveCommandsOnTheAppliedChannelAndRevisionWhileEditsAreUnapplied(
  scope: FrontPanelTestScope,
): void {
  it('keeps live commands on the applied channel and revision while edits are unapplied', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const configuration = scope.required(result.current.configuration);
    act(() =>
      result.current.edit(
        updateTerminal(configuration, DIGITAL_TERMINALS[0], 'Door lock', {
          capabilities: ['output', 'pulse'],
          pulse: { durationMs: 3000 },
        }),
      ),
    );
    expect(result.current.dirty).toBe(true);
    act(() => result.current.live.command(scope.required(result.current.applied).snapshot.logicalChannels[0], true));
    await waitFor(() =>
      expect(scope.api.manual).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ channelId: 'output', action: 'set', value: true, expectedConfigurationRevision: 7 }),
      ),
    );
    expect(scope.api.save).not.toHaveBeenCalled();
  });
}

export function registerPreservesASavedUnappliedDraftWhenAnotherSessionAppliesANewRevision(
  scope: FrontPanelTestScope,
): void {
  it('preserves a saved unapplied draft when another session applies a new revision', async () => {
    const savedDraft = {
      ...scope.draft,
      presetProvenance: JSON.stringify({ editor: { names: { output: 'Saved draft name' }, presets: [] } }),
    };
    scope.api.getDraft.mockResolvedValue(savedDraft);
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.configuration?.metadata.names.output).toBe('Saved draft name');
    act(() =>
      scope.client.setQueryData(['wago', 'configuration-baseline', 1], {
        ...scope.draft,
        presetProvenance: JSON.stringify({ editor: { names: { output: 'External applied name' }, presets: [] } }),
        revision: 8,
        state: 'applied',
      }),
    );
    await waitFor(() => expect(result.current.applied?.metadata.names.output).toBe('External applied name'));
    expect(result.current.configuration?.metadata.names.output).toBe('Saved draft name');
    expect(result.current.dirty).toBe(true);
  });
}

export function registerRequiresConfirmationEvenWithoutFlowImpactsAndRetainsTheRevisionAcknowledgementWait(
  scope: FrontPanelTestScope,
): void {
  it('requires confirmation even without flow impacts and retains the revision acknowledgement wait', async () => {
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.edit(
        updateTerminal(scope.required(result.current.configuration), DIGITAL_TERMINALS[0], 'Renamed output', {}),
      ),
    );
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(scope.api.publish).not.toHaveBeenCalled();
    act(() => result.current.confirmApply());
    await waitFor(() => expect(scope.api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
    expect(scope.api.validate).toHaveBeenCalledTimes(1);
    expect(scope.api.save).toHaveBeenCalledWith(1, expect.anything(), expect.anything(), scope.draft);
    await waitFor(() => expect(result.current.pending).toBe(true));
  });
}

export function registerRequiresFlowImpactConfirmationBeforePublication(scope: FrontPanelTestScope): void {
  it('requires flow impact confirmation before publication', async () => {
    scope.api.review.mockResolvedValue({
      draft: { ...scope.draft, reviewedHash: 'reviewed' },
      impacts: [{ channelId: 'output', references: [{ resourceId: 1, nodeId: 'flow' }] }],
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.apply());
    await waitFor(() => expect(result.current.review?.impacts).toHaveLength(1));
    expect(scope.api.publish).not.toHaveBeenCalled();
    act(() => result.current.confirmApply());
    await waitFor(() => expect(scope.api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
  });
}

export function registerRetainsThePendingApplyStateWhenReturningToThePage(scope: FrontPanelTestScope): void {
  it('retains the pending apply state when returning to the page', async () => {
    scope.api.diagnostics.mockReturnValue({
      isSuccess: true,
      data: {
        connectivity: 'online',
        capabilities: ['front-panel-v1'],
        channels: [],
        configuration: {
          appliedRevision: 7,
          publishedRevision: 8,
          publishedState: 'published',
          revisionMismatch: false,
          rejected: false,
        },
      },
      refetch: vi.fn(),
    });
    const { result } = renderHook(() => useFrontPanel(1), { wrapper: scope.wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.pending).toBe(true);
    expect(result.current.live.enabled).toBe(false);
  });
}

export function registerShowsEveryTerminalAndSwitchesLanguagesThroughTheHostStore(scope: FrontPanelTestScope): void {
  it('shows every terminal and switches languages through the host store', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    await screen.findByText('CC100 onboard I/O');
    for (const terminal of DIGITAL_TERMINALS) expect(screen.getByText(terminal.label)).toBeTruthy();
    expect(screen.queryByText('Unapplied changes')).toBeNull();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Integrierte CC100-Ein- und Ausgänge')).toBeTruthy();
    expect(screen.getByText('Laser power')).toBeTruthy();
    expect(scope.api.save).not.toHaveBeenCalled();
  });
}

export function registerShowsLabelAndAllowsConfirmationRegardlessOfOutputState(scope: FrontPanelTestScope): void {
  it.each([
    { value: true, current: true, label: 'HIGH (on)' },
    { value: false, current: true, label: 'LOW (off)' },
    { value: true, current: false, label: 'State unavailable' },
  ])('shows $label and allows confirmation regardless of output state', async ({ value, current, label }) => {
    const diagnostics = scope.api.diagnostics();
    diagnostics.data.channels[0].samples[0] = { kind: 'output', value, current };
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /^Configure DO1/ }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Changed label' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to controller' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apply configuration?' });
    expect(within(dialog).getByText(label)).toBeTruthy();
    expect(dialog.textContent).toContain('DO1 · Laser power');
    expect(scope.api.publish).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: 'Apply to controller' });
    await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(scope.api.publish).toHaveBeenCalledWith(1, true, 'reviewed'));
  });
}

export function registerTranslatesTheSharedBusBaudRateWhileItsDrawerIsOpen(scope: FrontPanelTestScope): void {
  it('translates the shared bus baud rate while its drawer is open', async () => {
    render(<FrontPanel controllerId={1} onClose={vi.fn()} onHistory={vi.fn()} />, { wrapper: scope.wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'RS-485 port · 9600 E1' }));
    expect(await screen.findByText('Baud rate')).toBeTruthy();
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(screen.getByText('Baudrate')).toBeTruthy();
    expect(document.body.textContent).not.toContain('!!!');
  });
}
