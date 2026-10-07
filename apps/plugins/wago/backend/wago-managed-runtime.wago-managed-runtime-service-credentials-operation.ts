import { ConflictException } from '@nestjs/common';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { Credentials } from './wago-managed-runtime.contracts';
import { restoreManagementKey } from './wago-management-key';
import { installerPublicKey } from './wago-managed-installer';
import { WagoManagedRuntimeServiceRequiredOperation } from './wago-managed-runtime.wago-managed-runtime-service-required-operation';


export abstract class WagoManagedRuntimeServiceCredentialsOperation extends WagoManagedRuntimeServiceRequiredOperation {
  protected credentials(access: WagoManagedAccess): Credentials {
    try {
      const value = JSON.parse(this.context.secrets.decrypt(access.encryptedCredentials)) as Credentials;
      if (
        value.sessionId !== access.sessionId ||
        value.host !== access.host ||
        typeof value.hardwareId !== 'string' ||
        !value.hardwareId ||
        value.fingerprint !== access.fingerprint ||
        value.token !== access.token ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.recoveryPassword)
      )
        throw new Error();
      restoreManagementKey(value.privateKey, access.keyFingerprint);
      installerPublicKey(value.installerPrivateKey);
      return value;
    } catch {
      throw new ConflictException('Managed credential envelope is unavailable or does not match this device');
    }
  }
}
