import type { WagoDiagnostics } from '../diagnostics-types';
import type { WagoResourceDiagnostics } from '../diagnostics-types';


export abstract class WagoDiagnosticsServiceGetResourceContract {
  abstract getResource(resourceId: number): Promise<WagoResourceDiagnostics>;
  abstract get(controllerId: number): Promise<WagoDiagnostics>;
}
