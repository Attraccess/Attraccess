import { WagoRuntimeUploadError } from './wago-commissioning.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';

export function registerReportsTheFixedImageLoadFailureWithoutExposingOtherRemoteOutput(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('reports the fixed image-load failure without exposing other remote output', () => {
    const error = new WagoRuntimeUploadError(
      1,
      300_000,
      'private-value\nRuntime image load failed or exceeded 300 seconds\n',
    );
    expect(error.message).toContain('Runtime image load failed or exceeded 300 seconds');
    expect(error.message).not.toContain('private-value');
  });
}
