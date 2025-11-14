
export async function createEmployeePass(options: {
  employeeId: number;
  employeeName: string;
  companyName: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  qrCode?: string;
  cardUrl?: string;
}): Promise<NodeJS.ReadableStream> {
  try {
    
    return await createFallbackPass(options);
    
  } catch (error) {
    throw new Error(`فشل في إنشاء بطاقة Apple Wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function createFallbackPass(options: {
  employeeId: number;
  employeeName: string;
  companyName: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  qrCode?: string;
  cardUrl?: string;
}): Promise<NodeJS.ReadableStream> {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${
    encodeURIComponent(options.qrCode || options.cardUrl || `https://sharik-sa.com/employees/${options.employeeId}`)
  }`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>بطاقة الموظف - ${options.employeeName}</title>
        <style>
            body { 
                font-family: 'Arial', 'Segoe UI', Tahoma, sans-serif; 
                text-align: center; 
                padding: 20px; 
                background: linear-gradient(135deg, #3c414c 0%, #2c3038 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .card { 
                background: white; 
                border-radius: 15px; 
                padding: 30px; 
                max-width: 400px; 
                margin: 0 auto; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                border: 2px solid #e0e0e0;
            }
            .header {
                background: #3c414c;
                color: white;
                padding: 15px;
                border-radius: 10px 10px 0 0;
                margin: -30px -30px 20px -30px;
            }
            .name { 
                font-size: 24px; 
                font-weight: bold; 
                margin-bottom: 10px; 
                color: #2c3038;
            }
            .company { 
                color: #666; 
                margin-bottom: 15px; 
                font-size: 18px;
            }
            .info { 
                text-align: right; 
                margin: 15px 0; 
                padding: 10px;
                background: #f8f9fa;
                border-radius: 8px;
                border-right: 4px solid #3c414c;
            }
            .info strong {
                color: #3c414c;
            }
            .qr-code {
                margin: 20px auto;
                padding: 10px;
                background: white;
                border-radius: 10px;
                display: inline-block;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h2>${options.companyName}</h2>
                <p>بطاقة تعريف الموظف</p>
            </div>
            <div class="name">${options.employeeName}</div>
            ${options.jobTitle ? `<div class="company">${options.jobTitle}</div>` : ''}
            
            ${options.email ? `<div class="info"><strong>البريد الإلكتروني:</strong><br>${options.email}</div>` : ''}
            ${options.phone ? `<div class="info"><strong>الهاتف:</strong><br>${options.phone}</div>` : ''}
            
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code" style="border-radius: 8px;">
            </div>
            
            <div style="color: #666; font-size: 12px; margin-top: 20px;">
                رقم الموظف: ${options.employeeId}
            </div>
        </div>
    </body>
    </html>
  `;

  const { Readable } = await import('stream');
  return Readable.from(Buffer.from(htmlContent));
}