/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs';
import { join } from 'path';
import { registerAttractapFirmwareHandlerFixture } from './handler.test-fixture';

const fixtureUi = (name: string) =>
  JSON.parse(
    readFileSync(join(__dirname, '../../../../../../attractap/firmware/tests/ui-fixtures', `${name}.json`), 'utf8'),
  ).payload;

describe('AttractapFirmwareHandler reader UI capabilities', () => {
  const fixture = registerAttractapFirmwareHandlerFixture();
  const info = (capabilities: unknown, extra: Record<string, unknown> = {}) =>
    ({ payload: { name: 'attractap', variant: 'touch', version: '1.0.0', capabilities, ...extra } }) as any;

  beforeEach(() => {
    fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({ version: '1.0.0' });
  });

  it('stores validated ui capabilities and the reset reason', async () => {
    const ui = fixtureUi('caps-touch');
    await fixture.handler.handleFirmwareInfo(
      fixture.socket,
      info({ resourceSelection: true, ui }, { resetReason: 'PANIC' }),
    );
    const stored = fixture.mockAttractapService.updateReaderFirmware.mock.calls[0][1];
    expect(stored.capabilities.ui).toMatchObject({ schemaVersion: 1, steps: ['confirm', 'choose', 'info'] });
    expect(stored.capabilities.resetReason).toBe('PANIC');
  });

  it('keeps Lite without display and screen steps', async () => {
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ ui: fixtureUi('caps-lite') }));
    const ui = fixture.mockAttractapService.updateReaderFirmware.mock.calls[0][1].capabilities.ui;
    expect(ui).toMatchObject({ display: null, components: [], slots: [], steps: ['card-confirm'] });
  });

  it('treats missing ui as schemaVersion 0 (null)', async () => {
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ resourceSelection: true }));
    expect(fixture.mockAttractapService.updateReaderFirmware.mock.calls[0][1].capabilities.ui).toBeNull();
  });

  it('ignores invalid ui instead of storing it', async () => {
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ ui: { schemaVersion: 'one', components: 5 } }));
    expect(fixture.mockAttractapService.updateReaderFirmware.mock.calls[0][1].capabilities.ui).toBeNull();
  });

  it('clamps limits a reader claims above the host schema', async () => {
    const ui = { ...fixtureUi('caps-touch'), maxPayloadBytes: 60000, maxNodes: 255, maxLiveNodes: 1000 };
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ ui }));
    expect(fixture.mockAttractapService.updateReaderFirmware.mock.calls[0][1].capabilities.ui).toMatchObject({
      maxPayloadBytes: 3072,
      maxNodes: 32,
      maxLiveNodes: 64,
    });
  });

  it('hands the raw payload to the UI handler for the initial slot sync and does not fail the OTA check if it throws', async () => {
    const onFirmwareInfo = jest.fn().mockRejectedValue(new Error('boom'));
    (fixture.handler as any).uiHandler = { onFirmwareInfo };
    const data = info({ ui: fixtureUi('caps-touch') });
    await expect(fixture.handler.handleFirmwareInfo(fixture.socket, data)).resolves.toBeUndefined();
    expect(onFirmwareInfo).toHaveBeenCalledWith(fixture.socket, data.payload);
  });
});
