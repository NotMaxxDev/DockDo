import * as fs from 'fs';
import * as path from 'path';

interface SelfSignedOptions {
  keySize?: number;
  days?: number;
  algorithm?: string;
  extensions?: Array<{ name: string; altNames?: Array<{ type: number; value?: string; ip?: string }> }>;
}

interface SelfSignedResult {
  private: string;
  cert: string;
}

function generateSelfSigned(attrs: Array<{ name: string; value: string }>, opts: SelfSignedOptions): SelfSignedResult {
  // Lazy import: 'selfsigned' wird nur beim ersten Erzeugen eines Zertifikats geladen.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const selfsigned = require('selfsigned') as {
    generate: (attrs: Array<{ name: string; value: string }>, opts: SelfSignedOptions) => SelfSignedResult;
  };
  return selfsigned.generate(attrs, opts);
}

export interface CertFiles {
  keyPath: string;
  certPath: string;
}

export function certPaths(dataDir: string): CertFiles {
  return {
    keyPath: path.join(dataDir, 'certs', 'key.pem'),
    certPath: path.join(dataDir, 'certs', 'cert.pem')
  };
}

export function ensureSelfSignedCert(dataDir: string, log: (msg: string) => void = console.log): CertFiles {
  const { keyPath, certPath } = certPaths(dataDir);
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const pems = generateSelfSigned([{ name: 'commonName', value: 'DockDo' }], {
    keySize: 2048,
    days: 3650,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }
    ]
  });
  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert);
  log(`[tls] Selbstsigniertes Zertifikat erzeugt: ${certPath}`);
  return { keyPath, certPath };
}
