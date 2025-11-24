import { Injectable } from '@nestjs/common';

export interface EmployeeForWallet {
  id: number;
  name: string;
  jobTitle?: string;
  company?: string;
  email?: string;
  phone?: string;
  qrCode?: string;
  cardUrl?: string;
  googleWalletUrl?: string;
  appleWalletUrl?: string;
}

@Injectable()
export class DigitalCardService {
  
  generateWalletHTML(employee: EmployeeForWallet, type: 'google' | 'apple'): string {
    const title = type === 'google' ? 'إضافة إلى محفظة Google' : 'إضافة إلى محفظة Apple';
    const buttonText = type === 'google' ? 'إضافة إلى Google Wallet' : 'إضافة إلى Apple Wallet';
    const icon = type === 'google' ? '🏷️' : '📱';
    
    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .card {
            background: white;
            border-radius: 20px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        
        .icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        
        .title {
            color: #333;
            font-size: 1.8rem;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .subtitle {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        
        .employee-info {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 25px;
            margin: 25px 0;
            text-align: right;
        }
        
        .info-item {
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .info-label {
            color: #555;
            font-weight: 600;
            font-size: 0.9rem;
        }
        
        .info-value {
            color: #333;
            font-weight: 500;
            font-size: 1rem;
        }
        
        .wallet-button {
            background: ${type === 'google' ? '#4285f4' : '#000'};
            color: white;
            border: none;
            padding: 18px 30px;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .wallet-button:hover {
            background: ${type === 'google' ? '#3367d6' : '#333'};
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        
        .wallet-button:active {
            transform: translateY(0);
        }
        
        .button-icon {
            font-size: 1.3rem;
        }
        
        .footer {
            margin-top: 25px;
            color: #888;
            font-size: 0.8rem;
            line-height: 1.5;
        }
        
        @media (max-width: 480px) {
            .card {
                padding: 25px;
            }
            
            .title {
                font-size: 1.5rem;
            }
            
            .wallet-button {
                padding: 15px 20px;
                font-size: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">${icon}</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">أضف بطاقة العمل الرقمية إلى ${type === 'google' ? 'محفظة Google' : 'محفظة Apple'} للوصول السريع إلى معلومات الاتصال</p>
        
        <div class="employee-info">
            <div class="info-item">
                <span class="info-value">${employee.name}</span>
                <span class="info-label">الاسم</span>
            </div>
            <div class="info-item">
                <span class="info-value">${employee.jobTitle || 'موظف'}</span>
                <span class="info-label">المسمى الوظيفي</span>
            </div>
            <div class="info-item">
                <span class="info-value">${employee.company || 'شركة'}</span>
                <span class="info-label">الشركة</span>
            </div>
            ${employee.email ? `
            <div class="info-item">
                <span class="info-value">${employee.email}</span>
                <span class="info-label">البريد الإلكتروني</span>
            </div>
            ` : ''}
            ${employee.phone ? `
            <div class="info-item">
                <span class="info-value">${employee.phone}</span>
                <span class="info-label">الهاتف</span>
            </div>
            ` : ''}
        </div>
        
        <button class="wallet-button" onclick="addToWallet()">
            <span class="button-icon">${type === 'google' ? '🏷️' : '📱'}</span>
            ${buttonText}
        </button>
        
        <div class="footer">
            ${type === 'google' ? 
                'بعد الإضافة، ستظهر البطاقة في خدمات Google المختلفة. يمكنك إدارة البطاقة في إعدادات محفظة Google.' :
                'بعد الإضافة، ستظهر البطاقة في محفظة Apple على أجهزتك المتصلة.'
            }
        </div>
    </div>

    <script>
        function addToWallet() {
            ${type === 'google' ? 
                `window.location.href = '${employee.googleWalletUrl || ''}';` :
                `window.location.href = '${employee.appleWalletUrl || ''}';`
            }
        }
        
        // محاولة الاكتشاف التلقائي للجوال
        if(${type === 'google'} && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            setTimeout(() => {
                addToWallet();
            }, 2000);
        }
    </script>
</body>
</html>
    `;
  }
}