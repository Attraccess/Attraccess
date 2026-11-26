/* eslint-disable @typescript-eslint/no-explicit-any */
import { SessionSecurityState } from '../../../security/session-security-state';
import { AttractapEventType } from '../../websocket.types';
import { registerAttractapFirmwareHandlerFixture } from './handler.test-fixture';

describe('AttractapFirmwareHandler and the secure profile (ATT-1208)', () => {
  const fixture = registerAttractapFirmwareHandlerFixture();
  const info = (extra: Record<string, unknown>) =>
    ({ payload: { name: 'attractap', variant: 'touch-v2', version: '2.13.0', capabilities: {}, ...extra } }) as any;
  const sentTypes = () => fixture.socket.sendMessage.mock.calls.map((call: any[]) => call[0].data.type);

  beforeEach(() => {
    fixture.mockFirmwareService.getFirmwareDefinition.mockResolvedValue({
      name: 'attractap',
      variant: 'touch-v2',
      version: '2.14.0',
      filename: 'plain.bin',
    });
    fixture.socket.sessionSecurity = new SessionSecurityState(42, 'f'.repeat(64));
  });

  it('records the secureConversion capability and the reported firmware on the session', async () => {
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ capabilities: { secureConversion: true } }));
    expect(fixture.socket.sessionSecurity.secureConversion).toBe(true);
    expect(fixture.socket.sessionSecurity.firmware).toEqual({
      name: 'attractap',
      variant: 'touch-v2',
      version: '2.13.0',
    });
  });

  it('offers a secured reader only the image signed for its digests, never the plain one', async () => {
    fixture.mockSecuredUpdates.prepare.mockResolvedValue({
      image: { path: '/signed/app.bin', size: 8192 },
      version: '2.14.0',
    });
    await fixture.handler.handleFirmwareInfo(
      fixture.socket,
      info({ profile: 'secure', release: true, secureVersion: 2 }),
    );
    expect(fixture.mockSecuredUpdates.prepare).toHaveBeenCalledWith(42, 'attractap', 'touch-v2', 2);
    expect(fixture.socket.state.ota).toEqual({ path: '/signed/app.bin', size: 8192 });
    expect(sentTypes()).toEqual([AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED]);
    expect(fixture.mockExistsSync).not.toHaveBeenCalled();
  });

  it('offers a secured reader nothing when no key can sign for it', async () => {
    await fixture.handler.handleFirmwareInfo(
      fixture.socket,
      info({ profile: 'secure', release: true, secureVersion: 1 }),
    );
    expect(fixture.socket.state.ota).toBeNull();
    expect(sentTypes()).toEqual([]);
  });

  it('never asks for a signed image for plain readers', async () => {
    fixture.mockExistsSync.mockReturnValue(false);
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ profile: 'plain', release: true }));
    expect(fixture.mockSecuredUpdates.prepare).not.toHaveBeenCalled();
  });

  it('offers no plain update to a reader whose conversion is staging into the inactive slot', async () => {
    fixture.mockConversionTransfer.stagingInUse.mockResolvedValue(true);
    fixture.mockExistsSync.mockReturnValue(true);
    fixture.mockStatSync.mockReturnValue({ size: 8192 } as any);
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ profile: 'plain', release: true }));
    expect(fixture.mockConversionTransfer.stagingInUse).toHaveBeenCalledWith(42);
    expect(fixture.socket.state.ota).toBeNull();
    expect(sentTypes()).toEqual([]);
  });

  it('still offers the plain update without an active conversion', async () => {
    fixture.mockExistsSync.mockReturnValue(true);
    fixture.mockStatSync.mockReturnValue({ size: 8192 } as any);
    await fixture.handler.handleFirmwareInfo(fixture.socket, info({ profile: 'plain', release: true }));
    expect(sentTypes()).toEqual([AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED]);
  });

  it('routes conversion chunk requests to the conversion transfer, not to OTA', async () => {
    fixture.mockConversionTransfer.chunk.mockResolvedValue(Buffer.from('abc'));
    const payload = { id: 3, conversion: 'app', offset: 0, length: 4096 };
    await fixture.handler.handleFirmwareChunkRequest(fixture.socket, { payload } as any);
    expect(fixture.mockConversionTransfer.chunk).toHaveBeenCalledWith(fixture.socket.sessionSecurity, payload);
    expect(fixture.socket.sendBinaryData).toHaveBeenCalledWith(Buffer.from('abc'));
    expect(fixture.mockOpenSync).not.toHaveBeenCalled();
  });

  it('answers nothing to a conversion chunk request outside a session', async () => {
    fixture.socket.sessionSecurity = undefined;
    await fixture.handler.handleFirmwareChunkRequest(fixture.socket, { payload: { conversion: 'app' } } as any);
    expect(fixture.mockConversionTransfer.chunk).not.toHaveBeenCalled();
    expect(fixture.socket.sendBinaryData).not.toHaveBeenCalled();
  });
});
