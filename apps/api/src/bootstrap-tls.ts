import { Logger } from '@nestjs/common';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { createCA, createCert } from 'mkcert';
import { join } from 'path';
import { AppConfigType } from './config/app.config';
import { StorageConfigType } from './config/storage.config';

export async function loadBootstrapTls(
  appConfig: AppConfigType,
  storageConfig: StorageConfigType,
  backendUrlFromDb: string | undefined,
  bootstrapLogger: Logger,
) {
  let httpsOptions: undefined | HttpsOptions = undefined;

  let sslCertFile: string | undefined;
  let sslKeyFile: string | undefined;

  if (appConfig.SSL_GENERATE_SELF_SIGNED_CERTIFICATES) {
    const storageDir = storageConfig.root;
    const host = backendUrlFromDb ?? appConfig.ATTRACCESS_URL;
    if (!host) {
      throw new Error(
        'Backend URL is required to generate self-signed certificates. Configure it in Settings or set ATTRACCESS_URL.',
      );
    }
    const hostUrl = new URL(host);
    const domain = hostUrl.hostname;

    if (!existsSync(`${domain}.pem`) || !existsSync(`${domain}.key`)) {
      bootstrapLogger.log('Generating self-signed certificates...');
      await generateSelfSignedCertificates(storageDir, domain);
    }

    sslCertFile = join(storageDir, `${domain}.pem`);
    sslKeyFile = join(storageDir, `${domain}.key`);
  }

  if (sslCertFile && sslKeyFile) {
    httpsOptions = {
      cert: await readFile(sslCertFile),
      key: await readFile(sslKeyFile),
    };
  }

  return httpsOptions;
}
async function generateSelfSignedCertificates(storageDir: string, domain: string) {
  const ca = await createCA({
    organization: 'Attraccess',
    countryCode: 'DE',
    state: 'Hamburg',
    locality: 'Hamburg',
    validity: 365,
  });

  const cert = await createCert({
    ca: { key: ca.key, cert: ca.cert },
    domains: ['127.0.0.1', 'localhost', domain],
    validity: 365,
  });

  await writeFile(join(storageDir, `${domain}.pem`), cert.cert, { mode: 0o644 });
  await writeFile(join(storageDir, `${domain}.key`), cert.key, { mode: 0o644 });
}
