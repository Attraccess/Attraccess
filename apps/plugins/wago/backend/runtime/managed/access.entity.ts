import type { WagoDeviceOperationRow, WagoManagedAccessRow, WagoRuntimeUpdateRow } from '../../storage';

/** New enrolments only. Never serialize this row or its encrypted envelope. */
export type WagoManagedAccess = WagoManagedAccessRow;
export type WagoRuntimeUpdateEntity = WagoRuntimeUpdateRow;
/** Shared by commissioning, managed SSH and updates; keyed by pinned device identity. */
export type WagoDeviceOperation = WagoDeviceOperationRow;
