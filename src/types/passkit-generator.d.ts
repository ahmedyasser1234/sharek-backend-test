declare module 'passkit-generator' {
  import { Readable } from 'stream';

  interface CertificateConfig {
    wwdr: Buffer;
    signerCert: Buffer;
    signerKey: Buffer;
    password: string;
  }

  interface Barcode {
    message: string;
    format: string;
    messageEncoding: string;
  }

  interface PassOptions {
    model: string;
    certificates: CertificateConfig;
    overrides: {
      serialNumber: string;
      description: string;
      organizationName: string;
      logoText: string;
      barcode: Barcode;
    };
  }

  export default class Pass {
    constructor(options: PassOptions);
    generate(): Promise<Readable>;
  }
}
