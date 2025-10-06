import * as fs from 'fs';
import * as path from 'path';
import Pass from 'passkit-generator'; // ✅ بعد التعريف اليدوي

export function createEmployeePass(options: {
  employeeId: number;
  employeeName: string;
  companyName: string;
  qrCode?: string;
  cardUrl?: string;
}): Promise<NodeJS.ReadableStream> {
  const pass = new Pass({
    model: path.join(__dirname, '../../templates/employee.pass'),
    certificates: {
      wwdr: fs.readFileSync('./certs/WWDR.pem'),
      signerCert: fs.readFileSync('./certs/signerCert.pem'),
      signerKey: fs.readFileSync('./certs/signerKey.pem'),
      password: process.env.APPLE_CERT_PASSWORD!,
    },
    overrides: {
      serialNumber: `emp-${options.employeeId}`,
      description: `بطاقة الموظف ${options.employeeName}`,
      organizationName: options.companyName,
      logoText: options.employeeName,
      barcode: {
        message:
          options.qrCode ||
          options.cardUrl ||
          `https://yourdomain.com/employees/${options.employeeId}`,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      },
    },
  });

  return pass.generate();
}
