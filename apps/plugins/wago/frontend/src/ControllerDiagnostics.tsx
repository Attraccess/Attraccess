import { Component, type ReactNode } from 'react';
import { WagoStatus } from './ControllerDiagnostics.wago-status';
import { DiagnosticsFailure } from './ControllerDiagnostics.helpers';
import { DiagnosticsContent } from './ControllerDiagnostics.diagnostics-content';

export class WagoDiagnosticsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <DiagnosticsFailure /> : this.props.children;
  }
}

/** Includes polling and an error boundary; embedding hosts only supply the selected controller. */
export function ControllerDiagnostics(props: { controllerId: number; onConfigure?: () => void }) {
  return (
    <WagoDiagnosticsBoundary key={props.controllerId}>
      <DiagnosticsContent {...props} />
    </WagoDiagnosticsBoundary>
  );
}

export { WagoStatus };
