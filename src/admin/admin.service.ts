import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, IsNull } from 'typeorm';
import { Admin } from './entities/admin.entity';
import { Manager, ManagerRole } from './entities/manager.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription, SubscriptionStatus } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import * as bcrypt from 'bcryptjs';
import { AdminToken } from './auth/entities/admin-token.entity';
import { AdminJwtService } from './auth/admin-jwt.service';
import { ManagerToken } from './entities/manager-token.entity';
import { SubscriptionService } from '../subscription/subscription.service';
import { CompanyActivity } from '../company/entities/company-activity.entity';
import { CompanyToken } from '../company/auth/entities/company-token.entity';
import { CompanyLoginLog } from '../company/auth/entities/company-login-log.entity';
import { BankAccount } from './entities/bank-account.entity';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/admin-bank.dto';
import * as nodemailer from 'nodemailer';
import { Supadmin, SupadminRole } from './entities/supadmin.entity';
import { SupadminToken } from './entities/supadmin-token.entity';

export interface CompanyWithActivator {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  isVerified: boolean;
  subscriptionStatus: string;
  employeesCount: number;
  activatedBy: string;
  activatedById?: string;
  activatorType: string;
  subscriptionDate: Date;
  planName: string;
  adminEmail?: string;
  sellerEmail?: string;
  supadminEmail?: string;
}

export interface AdminWithCompanyData {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  companies?: CompanyWithActivator[];
  refreshToken?: string;
}

export interface SubscriptionResult {
  message: string;
  redirectToDashboard?: boolean;
  redirectToPayment?: boolean;
  checkoutUrl?: string;
  subscription?: CompanySubscription;
}

export interface ManagerWithoutPassword {
  id: string;
  email: string;
  role: ManagerRole;
  isActive: boolean;
  createdBy: Admin | null;
  createdById: string;
  tokens: ManagerToken[];
  activatedSubscriptions: CompanySubscription[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SupadminWithoutPassword {
  id: string;
  email: string;
  role: SupadminRole;
  isActive: boolean;
  createdAt: Date;
  createdBy: Admin | null;
}

export interface DatabaseDownloadResponse {
  message: string;
  data: {
    companies: Company[];
    employees: Employee[];
    subscriptions: CompanySubscription[];
    plans: Plan[];
    admins: Array<Pick<Admin, 'id' | 'email' | 'isActive' | 'createdAt'>>;
    managers: Array<{
      id: string;
      email: string;
      role: ManagerRole;
      isActive: boolean;
      createdAt: Date;
      createdBy: { id: string; email: string } | null;
    }>;
    supadmins: Array<{
      id: string;
      email: string;
      role: SupadminRole;
      isActive: boolean;
      createdAt: Date;
      createdBy: { id: string; email: string } | null;
    }>;
    bankAccounts: BankAccount[];
  };
  timestamp: string;
}

export interface AdminBankInfo {
  bankName?: string;
  accountNumber?: string;
  ibanNumber?: string;
}

export interface BankAccountResponse {
  id: string;
  bankName: string;
  accountNumber: string;
  ibanNumber: string;
}

interface CreateSupadminDto {
  email: string;
  password: string;
  role?: SupadminRole;
}

interface UpdateSupadminDto {
  role?: SupadminRole;
  isActive?: boolean;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(Manager) private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Supadmin) private readonly supadminRepo: Repository<Supadmin>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanySubscription) private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(AdminToken) private readonly tokenRepo: Repository<AdminToken>,
    @InjectRepository(ManagerToken) private readonly managerTokenRepo: Repository<ManagerToken>,
    @InjectRepository(SupadminToken) private readonly supadminTokenRepo: Repository<SupadminToken>,
    @InjectRepository(CompanyActivity) private readonly companyActivityRepo: Repository<CompanyActivity>,
    @InjectRepository(CompanyToken) private readonly companyTokenRepo: Repository<CompanyToken>,
    @InjectRepository(CompanyLoginLog) private readonly companyLoginLogRepo: Repository<CompanyLoginLog>,
    @InjectRepository(BankAccount) private readonly bankAccountRepo: Repository<BankAccount>,
    private readonly adminJwt: AdminJwtService,
    private readonly subscriptionService: SubscriptionService,
    private readonly dataSource: DataSource,
  ) {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter(): void {
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
      });
    } catch (error) {
      // تسجيل الخطأ دون إيقاف التنفيذ
    }
  }

  private async sendSupadminCreatedEmail(
    supadminEmail: string,
    adminEmail: string,
    password: string
  ): Promise<void> {
    try {
      const subject = `إنشاء حساب مسؤول أعلى جديد - منصة شارك`;
      
      const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body {
              font-family: 'Arial', 'Segoe UI', sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #007bff;
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .content {
              background-color: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .info-box {
              background-color: #f8f9fa;
              border-right: 4px solid #007bff;
              padding: 20px;
              margin-bottom: 20px;
              border-radius: 8px;
            }
            .info-box p {
              margin: 10px 0;
              font-size: 16px;
            }
            .info-box strong {
              color: #333;
              margin-left: 10px;
            }
            .warning-box {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .warning-title {
              color: #856404;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #777;
              font-size: 14px;
            }
            .login-info {
              background-color: #e8f5e9;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
            }
            .login-info h3 {
              color: #2e7d32;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>إنشاء حساب مسؤول أعلى جديد</h1>
            </div>
            
            <div class="content">
              <div class="info-box">
                <p><strong>مرحباً:</strong> ${supadminEmail}</p>
                <p><strong>تم إنشاء حسابك كمسؤول أعلى في منصة شارك</strong></p>
                <p><strong>بواسطة الأدمن:</strong> ${adminEmail}</p>
                <p><strong>تاريخ الإنشاء:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
              </div>
              
              <div class="login-info">
                <h3>بيانات تسجيل الدخول:</h3>
                <p><strong>البريد الإلكتروني:</strong> ${supadminEmail}</p>
                <p><strong>كلمة المرور:</strong> ${password}</p>
              </div>
              
              <div class="warning-box">
                <div class="warning-title">تنبيه مهم:</div>
                <p>• يرجى تغيير كلمة المرور فور تسجيل الدخول الأول</p>
                <p>• هذه البيانات سرية ولا يجب مشاركتها مع أي شخص</p>
                <p>• يمكنك تسجيل الدخول من خلال الرابط: ${process.env.FRONTEND_URL || 'https://dashboard.sharik-sa.com'}</p>
              </div>
              
              <div>
                <p>مع تحيات فريق الدعم الفني</p>
                <p>منصة شارك - أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>https://sharik-sa.com/</p>
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(supadminEmail, subject, html);

      // إرسال نسخة للأدمن
      const adminCopyHtml = `
        <div dir="rtl">
          <h2>إشعار إنشاء مسؤول أعلى جديد</h2>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>المسؤول الأعلى:</strong> ${supadminEmail}</p>
            <p><strong>البريد الإلكتروني:</strong> ${supadminEmail}</p>
            <p><strong>تم الإنشاء بواسطة:</strong> ${adminEmail}</p>
            <p><strong>كلمة المرور الأولية:</strong> ${password}</p>
            <p><strong>التاريخ:</strong> ${new Date().toLocaleString('ar-SA')}</p>
          </div>
        </div>
      `;
      
      await this.sendEmail(
        process.env.ADMIN_NOTIFICATION_EMAIL || adminEmail,
        `إشعار إنشاء مسؤول أعلى - ${supadminEmail}`,
        adminCopyHtml
      );

    } catch (error) {
      // تسجيل الخطأ دون إيقاف التنفيذ
    }
  }

  private async sendSubscriptionActionEmail(
    companyEmail: string,
    companyName: string,
    adminEmail: string,
    planName: string,
    action: 'created' | 'renewed' | 'cancelled' | 'extended' | 'changed',
    details: string
  ): Promise<void> {
    try {
      const actionText = {
        'created': 'تم إنشاء اشتراك جديد',
        'renewed': 'تم تجديد الاشتراك',
        'cancelled': 'تم إلغاء الاشتراك',
        'extended': 'تم تمديد الاشتراك',
        'changed': 'تم تغيير الخطة'
      };

      const actionColor = {
        'created': '#28a745',
        'renewed': '#007bff',
        'cancelled': '#dc3545',
        'extended': '#ffc107',
        'changed': '#17a2b8'
      };

      const subject = `تحديث اشتراك - ${companyName}`;
      
      const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body {
              font-family: 'Arial', 'Segoe UI', sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: ${actionColor[action]};
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .content {
              background-color: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .info-box {
              background-color: #f8f9fa;
              border-right: 4px solid ${actionColor[action]};
              padding: 20px;
              margin-bottom: 20px;
              border-radius: 8px;
            }
            .info-box p {
              margin: 10px 0;
              font-size: 16px;
            }
            .info-box strong {
              color: #333;
              margin-left: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #777;
              font-size: 14px;
            }
            .company-info {
              background-color: #f0f7ff;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
              text-align: center;
            }
            .company-info h3 {
              color: #007bff;
              margin-bottom: 10px;
            }
            .action-details {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .details-title {
              color: #856404;
              font-weight: bold;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${actionText[action]}</h1>
            </div>
            
            <div class="content">

            <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>البريد الإلكتروني:</strong> ${companyEmail}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>تاريخ الإجراء:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>بواسطة الأدمن:</strong> ${adminEmail}</p>
              </div>
              
              <div class="action-details">
                <div class="details-title">تفاصيل الإجراء:</div>
                <p>${details}</p>
              </div>
            
                 <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(companyEmail, subject, html);

      const companyAdminEmail = process.env.COMPANY_ADMIN_EMAIL || process.env.EMAIL_USER;
      if (companyAdminEmail && companyAdminEmail !== companyEmail) {
        const adminSubject = `إشعار - ${actionText[action]} - ${companyName}`;
        const adminHtml = `
          <div dir="rtl">
            <h2>إشعار ${actionText[action]}</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>الشركة:</strong> ${companyName}</p>
              <p><strong>البريد:</strong> ${companyEmail}</p>
              <p><strong>الخطة:</strong> ${planName}</p>
              <p><strong>بواسطة الأدمن:</strong> ${adminEmail}</p>
              <p><strong>تفاصيل الإجراء:</strong> ${details}</p>
              <p><strong>التاريخ:</strong> ${new Date().toLocaleString('ar-SA')}</p>
            </div>
          </div>
        `;
        await this.sendEmail(companyAdminEmail, adminSubject, adminHtml);
      }

    } catch (error) {
      // تسجيل الخطأ دون إيقاف التنفيذ
    }
  }

  async ensureDefaultAdmin(): Promise<void> {
    const defaultEmail = 'admin@system.local';
    const defaultPassword = 'admin123';

    const exists = await this.adminRepo.findOne({ where: { email: defaultEmail } });
    if (exists) return;

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const admin = this.adminRepo.create({
      email: defaultEmail,
      password: hashedPassword,
    });

    await this.adminRepo.save(admin);
  }

  async login(email: string, password: string): Promise<{ 
    accessToken: string; 
    refreshToken: string;
    admin: { email: string };
  }> 
  {
    const admin = await this.adminRepo.findOne({ 
      where: { email, isActive: true } 
    });
  
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = { adminId: admin.id, role: 'admin' };
    const accessToken = this.adminJwt.signAccess(payload);
    const refreshToken = this.adminJwt.signRefresh(payload);

    await this.tokenRepo.save({ admin, refreshToken });

    return { 
      accessToken, 
      refreshToken, 
      admin: { email: admin.email }
    };
  }

  async refresh(refreshToken: string): Promise<{ 
    accessToken: string;
    admin: AdminWithCompanyData;
  }> {
    const token = await this.tokenRepo.findOne({
      where: { refreshToken },
      relations: ['admin'],
    });

    if (!token) throw new UnauthorizedException('توكن غير صالح');

    const payload = this.adminJwt.verifyRefresh(refreshToken);
    if (!payload || payload.adminId !== token.admin.id) {
      throw new UnauthorizedException('توكن غير مطابق');
    }

    const accessToken = this.adminJwt.signAccess(payload);
    
    const companies = await this.getAdminCompanies(token.admin.id);
    
    const adminData: AdminWithCompanyData = {
      id: token.admin.id,
      email: token.admin.email,
      isActive: token.admin.isActive,
      createdAt: token.admin.createdAt,
      companies: companies,
      refreshToken: refreshToken
    };

    return { 
      accessToken, 
      admin: adminData 
    };
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.tokenRepo.delete({ refreshToken });
    return { success: true };
  }

  async getAdminEmail(adminId: string): Promise<{ email: string }> {
    const admin = await this.adminRepo.findOne({ 
      where: { id: adminId },
      select: ['email']
    });

    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }
    
    return {
      email: admin.email
    };
  }

async getAdminCompanies(adminId: string): Promise<CompanyWithActivator[]> {
  try {
    // جلب جميع الاشتراكات التي قام بها أي أدمن (ليس فقط الأدمن الحالي)
    const subscriptions = await this.subRepo.find({
      relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
      where: [
        { activatedByAdmin: { id: Not(IsNull()) } }, // أي أدمن
        { activatedBySeller: { createdBy: { id: adminId } } } // البائعون الذين أنشأهم هذا الأدمن
      ]
    });

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          if (!sub.company || !sub.company.id) {
            return null;
          }

          const employeesCount = await this.employeeRepo.count({
            where: { company: { id: sub.company.id } }
          });

          // الحصول على بريد الأدمن إذا كان موجودًا
          let adminEmail = 'غير معروف';
          let adminIdForEmail = sub.activatedByAdmin?.id;
          
          if (sub.activatedByAdmin) {
            // إذا كان البريد موجودًا في العلاقة المباشرة
            if (sub.activatedByAdmin.email) {
              adminEmail = sub.activatedByAdmin.email;
            } else if (adminIdForEmail) {
              // جلب البريد من قاعدة البيانات
              try {
                const admin = await this.adminRepo.findOne({
                  where: { id: adminIdForEmail },
                  select: ['email']
                });
                if (admin && admin.email) {
                  adminEmail = admin.email;
                }
              } catch (err) {
                this.logger.warn(`فشل جلب بريد الأدمن ${adminIdForEmail}: ${err}`);
              }
            }
          }

          return {
            id: sub.company.id,
            name: sub.company.name || 'غير معروف',
            email: sub.company.email || 'غير معروف',
            phone: sub.company.phone || 'غير معروف',
            isActive: sub.company.isActive ?? false,
            isVerified: sub.company.isVerified ?? false,
            subscriptionStatus: sub.company.subscriptionStatus || 'غير معروف',
            employeesCount,
            activatedBy: sub.activatedBySeller ? 
              `${sub.activatedBySeller.email} (بائع)` : 
              (sub.activatedByAdmin ? `${adminEmail} (أدمن)` : 'غير معروف'),
            activatedById: sub.activatedBySeller?.id || sub.activatedByAdmin?.id,
            activatorType: sub.activatedBySeller ? 'بائع' : (sub.activatedByAdmin ? 'أدمن' : 'غير معروف'),
            subscriptionDate: sub.startDate,
            planName: sub.plan?.name || 'غير معروف',
            adminEmail: sub.activatedByAdmin ? adminEmail : undefined,
            sellerEmail: sub.activatedBySeller?.email
          } as CompanyWithActivator;
        } catch (error) {
          this.logger.error(`خطأ في معالجة شركة ${sub.company?.id}: ${error}`);
          return null;
        }
      })
    );

    return results.filter((item): item is CompanyWithActivator => item !== null);
  } catch (error) {
    this.logger.error(`خطأ في getAdminCompanies: ${error}`);
    return [];
  }
}

  async createAdmin(dto: { email: string; password: string }): Promise<Admin> {
    const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const admin = this.adminRepo.create({
      email: dto.email,
      password: hashedPassword,
    });

    return this.adminRepo.save(admin);
  }

  async createSupadmin(
    adminId: string, 
    dto: CreateSupadminDto
  ): Promise<SupadminWithoutPassword> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    
    const existing = await this.supadminRepo.findOne({ 
      where: { email: normalizedEmail } 
    });
    
    if (existing) {
      throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    
    const supadmin = this.supadminRepo.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: dto.role || SupadminRole.ADMIN,
      isActive: true,
      createdBy: admin,
    });

    const savedSupadmin = await this.supadminRepo.save(supadmin);

    await this.sendSupadminCreatedEmail(
      savedSupadmin.email,
      admin.email,
      dto.password
    );

    return {
      id: savedSupadmin.id,
      email: savedSupadmin.email,
      role: savedSupadmin.role,
      isActive: savedSupadmin.isActive,
      createdAt: savedSupadmin.createdAt,
      createdBy: admin,
    };
  }

  async getAllSupadmins(): Promise<SupadminWithoutPassword[]> {
    const supadmins = await this.supadminRepo.find({
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });

    return supadmins.map(supadmin => ({
      id: supadmin.id,
      email: supadmin.email,
      role: supadmin.role,
      isActive: supadmin.isActive,
      createdAt: supadmin.createdAt,
      createdBy: supadmin.createdBy ? {
        id: supadmin.createdBy.id,
        email: supadmin.createdBy.email,
      } as Admin : null,
    }));
  }

  async updateSupadmin(
    adminId: string,
    supadminId: string,
    dto: UpdateSupadminDto
  ): Promise<SupadminWithoutPassword> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId },
      relations: ['createdBy'],
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    if (supadmin.createdBy?.id !== adminId) {
      throw new ForbiddenException('غير مصرح - يمكنك فقط تعديل المسؤولين الذين قمت بإنشائهم');
    }

    Object.assign(supadmin, dto);
    const updatedSupadmin = await this.supadminRepo.save(supadmin);

    return {
      id: updatedSupadmin.id,
      email: updatedSupadmin.email,
      role: updatedSupadmin.role,
      isActive: updatedSupadmin.isActive,
      createdAt: updatedSupadmin.createdAt,
      createdBy: updatedSupadmin.createdBy ? {
        id: updatedSupadmin.createdBy.id,
        email: updatedSupadmin.createdBy.email,
      } as Admin : null,
    };
  }

  async toggleSupadminStatus(
    adminId: string,
    supadminId: string,
    isActive: boolean
  ): Promise<SupadminWithoutPassword> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId },
      relations: ['createdBy'],
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    if (supadmin.createdBy?.id !== adminId) {
      throw new ForbiddenException('غير مصرح - يمكنك فقط تعديل المسؤولين الذين قمت بإنشائهم');
    }

    supadmin.isActive = isActive;
    const updatedSupadmin = await this.supadminRepo.save(supadmin);

    if (!isActive) {
      await this.supadminTokenRepo.delete({ supadminId });
    }

    return {
      id: updatedSupadmin.id,
      email: updatedSupadmin.email,
      role: updatedSupadmin.role,
      isActive: updatedSupadmin.isActive,
      createdAt: updatedSupadmin.createdAt,
      createdBy: updatedSupadmin.createdBy ? {
        id: updatedSupadmin.createdBy.id,
        email: updatedSupadmin.createdBy.email,
      } as Admin : null,
    };
  }

  async deleteSupadmin(
    adminId: string,
    supadminId: string
  ): Promise<{ success: boolean; message: string }> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId },
      relations: ['createdBy'],
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    if (supadmin.createdBy?.id !== adminId) {
      throw new ForbiddenException('غير مصرح - يمكنك فقط حذف المسؤولين الذين قمت بإنشائهم');
    }

    await this.supadminTokenRepo.delete({ supadminId });
    
    await this.supadminRepo.delete(supadminId);
    
    return { 
      success: true, 
      message: 'تم حذف المسؤول الأعلى بنجاح' 
    };
  }

  async createManager(
    adminId: string, 
    dto: { email: string; password: string }
  ): Promise<ManagerWithoutPassword> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    const exists = await this.managerRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const manager = this.managerRepo.create({
      email: dto.email,
      password: hashedPassword,
      role: ManagerRole.SELLER,
      createdBy: admin,
    });

    const savedManager = await this.managerRepo.save(manager);
    
    const { ...result } = savedManager;
    return {
      ...result,
      tokens: [],
      activatedSubscriptions: []
    } as ManagerWithoutPassword;
  }

  async getAllManagers(): Promise<ManagerWithoutPassword[]> {
    const managers = await this.managerRepo.find({
      relations: ['createdBy'],
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          id: true,
          email: true,
        }
      }
    });

    return managers.map(manager => ({
      ...manager,
      createdBy: manager.createdBy ? { 
        id: manager.createdBy.id, 
        email: manager.createdBy.email 
      } as Admin : null,
      tokens: [],
      activatedSubscriptions: []
    })) as ManagerWithoutPassword[];
  }

  async updateManager(id: string, dto: Partial<Manager>): Promise<ManagerWithoutPassword> {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('البائع غير موجود');

    if (dto.email && dto.email !== manager.email) {
      const emailExists = await this.managerRepo.findOne({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.role && dto.role !== ManagerRole.SELLER) {
      throw new BadRequestException('الدور المسموح به هو البائع فقط');
    }

    Object.assign(manager, dto);
    const updatedManager = await this.managerRepo.save(manager);
    
    const { ...result } = updatedManager;
    return {
      ...result,
      tokens: [],
      activatedSubscriptions: []
    } as ManagerWithoutPassword;
  }

  async toggleManagerStatus(id: string, isActive: boolean): Promise<ManagerWithoutPassword> {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('البائع غير موجود');

    manager.isActive = isActive;
    const updatedManager = await this.managerRepo.save(manager);
    
    const { ...result } = updatedManager;
    return {
      ...result,
      tokens: [],
      activatedSubscriptions: []
    } as ManagerWithoutPassword;
  }

  async deleteManager(id: string): Promise<{ message: string }> {
    const manager = await this.managerRepo.findOne({ 
      where: { id },
      relations: ['tokens']
    });
    
    if (!manager) throw new NotFoundException('البائع غير موجود');

    await this.managerTokenRepo.delete({ manager: { id } });
    
    await this.managerRepo.delete(id);
    
    return { message: 'تم حذف البائع بنجاح' };
  }

  async updateAdmin(id: string, dto: Partial<Admin>): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    Object.assign(admin, dto);
    return this.adminRepo.save(admin);
  }

  async createBankAccount(dto: CreateBankAccountDto): Promise<BankAccountResponse> {
    const existingAccount = await this.bankAccountRepo.findOne({ 
      where: { accountNumber: dto.accountNumber } 
    });
    
    if (existingAccount) {
      throw new BadRequestException('رقم الحساب البنكي موجود بالفعل');
    }

    const existingIban = await this.bankAccountRepo.findOne({ 
      where: { ibanNumber: dto.ibanNumber } 
    });
    
    if (existingIban) {
      throw new BadRequestException('رقم الآيبان موجود بالفعل');
    }

    const bankAccount = this.bankAccountRepo.create(dto);
    const savedAccount = await this.bankAccountRepo.save(bankAccount);
    
    return this.mapBankAccountToResponse(savedAccount);
  }

  async getAllBankAccounts(): Promise<BankAccountResponse[]> {
    const accounts = await this.bankAccountRepo.find();
    
    return accounts.map(account => this.mapBankAccountToResponse(account));
  }

  async getBankAccountById(id: string): Promise<BankAccountResponse> {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    
    if (!account) {
      throw new NotFoundException('الحساب البنكي غير موجود');
    }
    
    return this.mapBankAccountToResponse(account);
  }

  async updateBankAccount(id: string, dto: UpdateBankAccountDto): Promise<BankAccountResponse> {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    
    if (!account) {
      throw new NotFoundException('الحساب البنكي غير موجود');
    }

    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const existingAccount = await this.bankAccountRepo.findOne({ 
        where: { accountNumber: dto.accountNumber } 
      });
      
      if (existingAccount && existingAccount.id !== id) {
        throw new BadRequestException('رقم الحساب البنكي موجود بالفعل لحساب آخر');
      }
    }

    if (dto.ibanNumber && dto.ibanNumber !== account.ibanNumber) {
      const existingIban = await this.bankAccountRepo.findOne({ 
        where: { ibanNumber: dto.ibanNumber } 
      });
      
      if (existingIban && existingIban.id !== id) {
        throw new BadRequestException('رقم الآيبان موجود بالفعل لحساب آخر');
      }
    }

    Object.assign(account, dto);
    const updatedAccount = await this.bankAccountRepo.save(account);
    
    return this.mapBankAccountToResponse(updatedAccount);
  }

  async deleteBankAccount(id: string): Promise<{ message: string }> {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    
    if (!account) {
      throw new NotFoundException('الحساب البنكي غير موجود');
    }

    await this.bankAccountRepo.delete(id);
    
    return { message: 'تم حذف الحساب البنكي بنجاح' };
  }

  async getPublicBankAccounts(): Promise<BankAccountResponse[]> {
    const accounts = await this.bankAccountRepo.find();
    
    return accounts.map(account => this.mapBankAccountToResponse(account));
  }

  private mapBankAccountToResponse(account: BankAccount): BankAccountResponse {
    return {
      id: account.id,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      ibanNumber: account.ibanNumber,
    };
  }

  async getStats(): Promise<{ 
    companies: number; 
    employees: number; 
    activeSubscriptions: number;
    managers: number;
    supadmins: number;
  }> {
    const companies = await this.companyRepo.count();
    const employees = await this.employeeRepo.count();
    const activeSubs = await this.subRepo.count({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    const managers = await this.managerRepo.count();
    const supadmins = await this.supadminRepo.count();

    return { 
      companies, 
      employees, 
      activeSubscriptions: activeSubs,
      managers,
      supadmins
    };
  }

  async getAllCompaniesWithEmployeeCount(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    isVerified: boolean;
    subscriptionStatus: string;
    employeesCount: number;
  }>> {
    const companies = await this.companyRepo.find();

    const result = await Promise.all(
      companies.map(async (company) => {
        const count = await this.employeeRepo.count({ where: { company: { id: company.id } } });
        return {
          id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
          isActive: company.isActive,
          isVerified: company.isVerified,
          subscriptionStatus: company.subscriptionStatus,
          employeesCount: count,
        };
      }),
    );

    return result;
  }

  async getAllCompaniesWithActivator(): Promise<CompanyWithActivator[]> {
  try {
    const subscriptions = await this.subRepo.find({
      relations: [
        'company', 
        'plan', 
        'activatedBySeller', 
        'activatedByAdmin',
        'activatedBySupadmin' 
      ],
      where: {
        company: { id: Not(IsNull()) }
      },
      order: {
        startDate: 'DESC' 
      }
    });

    const companyMap = new Map<string, CompanyWithActivator>();

    for (const sub of subscriptions) {
      try {
        if (!sub.company || !sub.company.id) {
          continue;
        }

        const companyId = sub.company.id;
        
        if (companyMap.has(companyId)) {
          continue;
        }

        const employeesCount = await this.employeeRepo.count({
          where: { company: { id: companyId } }
        });

        let activatedBy = 'غير معروف';
        let activatorType = 'غير معروف';
        let activatedById: string | undefined;
        let adminEmail: string | undefined;
        let sellerEmail: string | undefined;
        let supadminEmail: string | undefined;

        if (sub.activatedBySupadmin) {
          activatedBy = `${sub.activatedBySupadmin.email} (مسؤول أعلى)`;
          activatorType = 'مسؤول أعلى';
          activatedById = sub.activatedBySupadmin.id;
          supadminEmail = sub.activatedBySupadmin.email;
        } else if (sub.activatedByAdmin) {
          activatedBy = `${sub.activatedByAdmin.email} (أدمن)`;
          activatorType = 'أدمن';
          activatedById = sub.activatedByAdmin.id;
          adminEmail = sub.activatedByAdmin.email;
        } else if (sub.activatedBySeller) {
          activatedBy = `${sub.activatedBySeller.email} (بائع)`;
          activatorType = 'بائع';
          activatedById = sub.activatedBySeller.id;
          sellerEmail = sub.activatedBySeller.email;
        }

        companyMap.set(companyId, {
          id: sub.company.id,
          name: sub.company.name || 'غير معروف',
          email: sub.company.email || 'غير معروف',
          phone: sub.company.phone || 'غير معروف',
          isActive: sub.company.isActive ?? false,
          isVerified: sub.company.isVerified ?? false,
          subscriptionStatus: sub.company.subscriptionStatus || 'غير معروف',
          employeesCount,
          activatedBy,
          activatedById,
          activatorType,
          subscriptionDate: sub.startDate,
          planName: sub.plan?.name || 'غير معروف',
          adminEmail,
          sellerEmail,
          supadminEmail    
        });
      } catch (error) {
        console.error(`خطأ في معالجة اشتراك الشركة:`, error);
        continue;
      }
    }

    return Array.from(companyMap.values());
  } catch (error) {
    console.error('خطأ في جلب الشركات مع المفعّلين:', error);
    return [];
  }
}

  async toggleCompany(id: string, isActive: boolean): Promise<Company | null> {
    await this.companyRepo.update(id, { isActive });
    return this.companyRepo.findOne({ where: { id } });
  }

  async updateCompany(id: string, dto: Partial<Company>): Promise<Company | null> {
    await this.companyRepo.update(id, dto);
    return this.companyRepo.findOne({ where: { id } });
  }

  async deleteCompany(id: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(CompanyActivity, { company: { id } });
      await queryRunner.manager.delete(CompanyToken, { company: { id } });
      await queryRunner.manager.delete(CompanyLoginLog, { company: { id } });
      await queryRunner.manager.delete(Employee, { company: { id } });
      await queryRunner.manager.delete(CompanySubscription, { company: { id } });

      await queryRunner.manager.delete(Company, { id });

      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
    
      if (error instanceof Error) {
        throw new InternalServerErrorException('فشل في حذف الشركة: ' + error.message);
      } else {
        throw new InternalServerErrorException('فشل في حذف الشركة: خطأ غير معروف');
      }
    } finally {
      await queryRunner.release();
    }
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return this.employeeRepo.find({ where: { company: { id: companyId } } });
  }

  async deleteEmployee(id: number): Promise<void> {
    await this.employeeRepo.delete(id);
  }

  async getAllSubscriptions(): Promise<CompanySubscription[]> {
    return this.subRepo.find({ relations: ['company', 'plan'] });
  }

  async activateSubscription(id: string): Promise<CompanySubscription | null> {
    await this.subRepo.update(id, { status: SubscriptionStatus.ACTIVE });
    return this.subRepo.findOne({ where: { id } });
  }

  async changeSubscriptionPlan(
    subscriptionId: string, 
    planId: string,
    adminId: string
  ): Promise<CompanySubscription | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const subscription = await queryRunner.manager.findOne(CompanySubscription, {
        where: { id: subscriptionId },
        relations: ['company', 'plan', 'activatedByAdmin']
      });
      
      if (!subscription) {
        throw new NotFoundException('الاشتراك غير موجود');
      }

      const newPlan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId }
      });
      
      if (!newPlan) {
        throw new NotFoundException('الخطة غير موجودة');
      }

      const admin = await queryRunner.manager.findOne(Admin, {
        where: { id: adminId }
      });

      const oldPlanName = subscription.plan?.name || 'غير معروف';
      subscription.plan = newPlan;
      subscription.price = newPlan.price;
      subscription.currency = 'SAR';
      
      subscription.status = SubscriptionStatus.ACTIVE;
      
      if (!subscription.endDate) {
        if (newPlan.durationInDays) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + newPlan.durationInDays);
          subscription.endDate = endDate;
        }
      }
      
      await queryRunner.manager.save(subscription);

      await queryRunner.manager.update(Company, subscription.company.id, {
        subscriptionStatus: 'active',
        isActive: true
      });

      await queryRunner.commitTransaction();

      const newEndDateStr = subscription.endDate ? subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
      const details = `تم تغيير الخطة من "${oldPlanName}" إلى "${newPlan.name}". السعر الجديد: ${newPlan.price} ريال. المدة: ${newPlan.durationInDays || 30} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        subscription.company.email,
        subscription.company.name,
        admin?.email || 'النظام',
        newPlan.name,
        'changed',
        details
      );
      
      return subscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في تغيير الخطة: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في تغيير الخطة: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }

  async changeCompanyPlan(
    companyId: string, 
    planId: string,
    adminId: string
  ): Promise<CompanySubscription> {
    const currentSubscription = await this.subRepo.findOne({
      where: { company: { id: companyId } },
      order: { createdAt: 'DESC' },
      relations: ['company', 'plan', 'activatedByAdmin']
    });
    
    if (!currentSubscription) {
      throw new NotFoundException('لا يوجد اشتراك حالي للشركة');
    }
    
    const newPlan = await this.planRepo.findOne({
      where: { id: planId }
    });
    
    if (!newPlan) {
      throw new NotFoundException('الخطة غير موجودة');
    }
    
    const currentEmployeesCount = await this.employeeRepo.count({
      where: { company: { id: companyId } }
    });
    
    if (newPlan.maxEmployees && currentEmployeesCount > newPlan.maxEmployees) {
      throw new BadRequestException(
        `لا يمكن الانتقال إلى الخطة الجديدة لأن عدد الموظفين الحاليين (${currentEmployeesCount}) يتجاوز الحد المسموح به في هذه الخطة (${newPlan.maxEmployees}). يرجى تقليل عدد الموظفين أولاً.`
      );
    }
    
    let currentPlanPrice = parseFloat(String(currentSubscription.price || 0));
    if (currentPlanPrice === 0 && currentSubscription.plan?.price) {
      currentPlanPrice = parseFloat(String(currentSubscription.plan.price));
    }
    
    const newPlanPrice = parseFloat(String(newPlan.price || 0));
    
    if (newPlanPrice < currentPlanPrice) {
      throw new BadRequestException(
        `لا يسمح بالانتقال من خطة أعلى سعراً (${currentPlanPrice} ريال) إلى خطة أقل سعراً (${newPlanPrice} ريال). يسمح فقط بالانتقال إلى خطط مساوية أو أعلى سعراً.`
      );
    }
    
    let remainingDays = 0;
    if (currentSubscription.endDate) {
      const now = new Date();
      const endDate = new Date(currentSubscription.endDate);
      const timeDiff = endDate.getTime() - now.getTime();
      remainingDays = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
    }
    
    const oldPlanName = currentSubscription.plan?.name || 'غير معروف';
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      currentSubscription.plan = newPlan;
      currentSubscription.price = newPlanPrice;
      currentSubscription.currency = 'SAR';
      
      currentSubscription.status = SubscriptionStatus.ACTIVE;
      
      if (remainingDays > 0) {
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + remainingDays);
        currentSubscription.endDate = newEndDate;
      } else {
        if (newPlan.durationInDays) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + newPlan.durationInDays);
          currentSubscription.endDate = endDate;
        }
      }
      
      await queryRunner.manager.save(currentSubscription);
      
      await queryRunner.manager.update(Company, companyId, {
        subscriptionStatus: 'active',
        isActive: true
      });
      
      await queryRunner.commitTransaction();

      const admin = await this.adminRepo.findOne({ where: { id: adminId } });
      const newEndDateStr = currentSubscription.endDate ? currentSubscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
      const details = `تم تغيير خطة الشركة من "${oldPlanName}" إلى "${newPlan.name}". السعر الجديد: ${newPlanPrice} ريال. المدة المتبقية: ${remainingDays} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        currentSubscription.company.email,
        currentSubscription.company.name,
        admin?.email || 'النظام',
        newPlan.name,
        'changed',
        details
      );
      
      return currentSubscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في تغيير خطة الشركة: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في تغيير خطة الشركة: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }

  async upgradeCompanySubscription(
    companyId: string, 
    planId: string,
    adminId: string
  ): Promise<CompanySubscription> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const company = await queryRunner.manager.findOne(Company, {
        where: { id: companyId }
      });
      
      if (!company) {
        throw new NotFoundException('الشركة غير موجودة');
      }

      const currentSubscription = await queryRunner.manager.findOne(CompanySubscription, {
        where: { company: { id: companyId } },
        order: { createdAt: 'DESC' },
        relations: ['activatedByAdmin']
      });

      const newPlan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId }
      });
      
      if (!newPlan) {
        throw new NotFoundException('الخطة غير موجودة');
      }

      const currentEmployeesCount = await this.employeeRepo.count({
        where: { company: { id: companyId } }
      });

      if (newPlan.maxEmployees && currentEmployeesCount > newPlan.maxEmployees) {
        throw new BadRequestException(
          `لا يمكن الانتقال إلى الخطة الجديدة لأن عدد الموظفين الحاليين (${currentEmployeesCount}) يتجاوز الحد المسموح به في هذه الخطة (${newPlan.maxEmployees})`
        );
      }

      let currentPlanPrice = 0;
      if (currentSubscription) {
        currentPlanPrice = parseFloat(String(currentSubscription.price || 0));
        if (currentPlanPrice === 0 && currentSubscription.plan?.price) {
          currentPlanPrice = parseFloat(String(currentSubscription.plan.price));
        }
      }
      
      const newPlanPrice = parseFloat(String(newPlan.price || 0));
      
      if (newPlanPrice < currentPlanPrice) {
        throw new BadRequestException(
          `لا يسمح بالانتقال من خطة أعلى سعراً (${currentPlanPrice} ريال) إلى خطة أقل سعراً (${newPlanPrice} ريال)`
        );
      }

      const admin = await queryRunner.manager.findOne(Admin, {
        where: { id: adminId }
      });

      const newSubscription = this.subRepo.create({
        company,
        plan: newPlan,
        price: newPlanPrice,
        currency: 'SAR',
        startDate: new Date(),
        status: SubscriptionStatus.ACTIVE,
        activatedByAdmin: currentSubscription?.activatedByAdmin || null,
      });

      if (currentSubscription?.endDate) {
        newSubscription.endDate = currentSubscription.endDate;
      } else if (newPlan.durationInDays) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + newPlan.durationInDays);
        newSubscription.endDate = endDate;
      }

      await queryRunner.manager.save(CompanySubscription, newSubscription);

      if (currentSubscription) {
        currentSubscription.status = SubscriptionStatus.CANCELLED;
        await queryRunner.manager.save(CompanySubscription, currentSubscription);
      }

      company.subscriptionStatus = 'active';
      company.isActive = true;
      await queryRunner.manager.save(Company, company);

      await queryRunner.commitTransaction();

      const newEndDateStr = newSubscription.endDate ? newSubscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
      const oldPlanName = currentSubscription?.plan?.name || 'غير معروف';
      const details = `تم ترقية الاشتراك من خطة "${oldPlanName}" إلى خطة "${newPlan.name}". السعر الجديد: ${newPlanPrice} ريال. المدة: ${newPlan.durationInDays || 30} يوم. تاريخ الانتهاء: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        company.email,
        company.name,
        admin?.email || 'النظام',
        newPlan.name,
        'changed',
        details
      );

      return newSubscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في ترقية الاشتراك: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في ترقية الاشتراك: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }

 async subscribeCompanyToPlan(companyId: string, planId: string, adminId: string): Promise<SubscriptionResult> {
  try {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    const plan = await this.planRepo.findOne({ where: { id: planId } });

    const result = await this.subscriptionService.subscribe(
      companyId,       
      planId, 
      true, 
      undefined,
      admin.id,           
      admin.email            
    );
  
    const subscriptionResult: SubscriptionResult = {
      message: result.message,
      redirectToDashboard: result.redirectToDashboard,
      redirectToPayment: result.redirectToPayment,
      checkoutUrl: result.checkoutUrl,
      subscription: result.subscription,
    };

    if (company && plan && result.subscription) {
      const newEndDateStr = result.subscription.endDate ? result.subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
      const details = `تم تفعيل اشتراك جديد في خطة "${plan.name}" بواسطة الأدمن. السعر: ${plan.price} ريال. المدة: ${plan.durationInDays || 30} يوم. تاريخ الانتهاء: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        company.email,
        company.name,
        admin.email,
        plan.name,
        'created',
        details
      );
    }
  
    return subscriptionResult;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new InternalServerErrorException(`فشل في الاشتراك: ${error.message}`);
    }
    throw new InternalServerErrorException('فشل في الاشتراك');
  }
}

  async downloadDatabase(): Promise<DatabaseDownloadResponse> {
    const companies = await this.companyRepo.find();
    const employees = await this.employeeRepo.find();
    const subscriptions = await this.subRepo.find({ relations: ['company', 'plan'] });
    const plans = await this.planRepo.find();
    
    const admins = await this.adminRepo.find({ 
      select: ['id', 'email', 'isActive', 'createdAt'] as (keyof Admin)[]
    });

    const managers = await this.managerRepo.find({ 
      relations: ['createdBy'],
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        createdBy: {
          id: true,
          email: true,
        }
      }
    });

    const supadmins = await this.supadminRepo.find({ 
      relations: ['createdBy'],
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        createdBy: {
          id: true,
          email: true,
        }
      }
    });

    const bankAccounts = await this.bankAccountRepo.find();

    const data = {
      companies,
      employees,
      subscriptions,
      plans,
      admins,
      managers: managers.map(manager => ({
        id: manager.id,
        email: manager.email,
        role: manager.role,
        isActive: manager.isActive,
        createdAt: manager.createdAt,
        createdBy: manager.createdBy ? {
          id: manager.createdBy.id,
          email: manager.createdBy.email
        } : null
      })),
      supadmins: supadmins.map(supadmin => ({
        id: supadmin.id,
        email: supadmin.email,
        role: supadmin.role,
        isActive: supadmin.isActive,
        createdAt: supadmin.createdAt,
        createdBy: supadmin.createdBy ? {
          id: supadmin.createdBy.id,
          email: supadmin.createdBy.email
        } : null
      })),
      bankAccounts
    };

    return {
      message: 'تم تحميل البيانات بنجاح',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  async cancelSubscription(
    subscriptionId: string, 
    adminId: string,
    reason?: string
  ): Promise<CompanySubscription> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const subscription = await queryRunner.manager.findOne(CompanySubscription, {
        where: { id: subscriptionId },
        relations: ['company', 'plan', 'activatedByAdmin']
      });

      if (!subscription) {
        throw new NotFoundException('الاشتراك غير موجود');
      }

      const admin = await queryRunner.manager.findOne(Admin, {
        where: { id: adminId }
      });

      subscription.status = SubscriptionStatus.CANCELLED;
    
      await queryRunner.manager.save(subscription);
      await queryRunner.manager.update(Company, subscription.company.id, {
        subscriptionStatus: 'inactive',
        isActive: false
      });

      await queryRunner.commitTransaction();

      const details = `تم إلغاء الاشتراك بالخطة "${subscription.plan?.name || 'غير معروف'}". ${reason ? `السبب: ${reason}` : 'بدون سبب محدد'}.`;
    
      await this.sendSubscriptionActionEmail(
        subscription.company.email,
        subscription.company.name,
        admin?.email || 'النظام',
        subscription.plan?.name || 'غير معروف',
        'cancelled',
        details
      );

      return subscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
    
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في إلغاء الاشتراك: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في إلغاء الاشتراك: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }

  async renewSubscription(
    subscriptionId: string, 
    adminId: string,
    durationInDays?: number
  ): Promise<CompanySubscription> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const subscription = await queryRunner.manager.findOne(CompanySubscription, {
        where: { id: subscriptionId },
        relations: ['company', 'plan', 'activatedByAdmin']
      });
      
      if (!subscription) {
        throw new NotFoundException('الاشتراك غير موجود');
      }

      const admin = await queryRunner.manager.findOne(Admin, {
        where: { id: adminId }
      });

      const renewalDays = durationInDays || subscription.plan?.durationInDays || 30;
      
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + renewalDays);
      
      subscription.endDate = newEndDate;
      subscription.status = SubscriptionStatus.ACTIVE;
      
      await queryRunner.manager.save(subscription);

      await queryRunner.manager.update(Company, subscription.company.id, {
        subscriptionStatus: 'active',
        isActive: true
      });

      await queryRunner.commitTransaction();

      const newEndDateStr = newEndDate.toLocaleDateString('ar-SA');
      const details = `تم تجديد الاشتراك بالخطة "${subscription.plan?.name || 'غير معروف'}" لمدة ${renewalDays} يوم. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        subscription.company.email,
        subscription.company.name,
        admin?.email || 'النظام',
        subscription.plan?.name || 'غير معروف',
        'renewed',
        details
      );

      return subscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في تجديد الاشتراك: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في تجديد الاشتراك: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }

  async extendSubscription(
    subscriptionId: string, 
    adminId: string,
    extraDays: number
  ): Promise<CompanySubscription> {
    if (extraDays <= 0) {
      throw new BadRequestException('عدد الأيام يجب أن يكون أكبر من صفر');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const subscription = await queryRunner.manager.findOne(CompanySubscription, {
        where: { id: subscriptionId },
        relations: ['company', 'plan', 'activatedByAdmin']
      });
      
      if (!subscription) {
        throw new NotFoundException('الاشتراك غير موجود');
      }

      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new BadRequestException('لا يمكن تمديد اشتراك غير نشط');
      }

      const admin = await queryRunner.manager.findOne(Admin, {
        where: { id: adminId }
      });

      const currentEndDate = subscription.endDate ? new Date(subscription.endDate) : new Date();
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + extraDays);
      
      subscription.endDate = newEndDate;
      
      await queryRunner.manager.save(subscription);

      await queryRunner.commitTransaction();

      const currentEndDateStr = currentEndDate.toLocaleDateString('ar-SA');
      const newEndDateStr = newEndDate.toLocaleDateString('ar-SA');
      const details = `تم تمديد الاشتراك بالخطة "${subscription.plan?.name || 'غير معروف'}" لمدة ${extraDays} يوم إضافية. تاريخ الانتهاء السابق: ${currentEndDateStr}. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
      
      await this.sendSubscriptionActionEmail(
        subscription.company.email,
        subscription.company.name,
        admin?.email || 'النظام',
        subscription.plan?.name || 'غير معروف',
        'extended',
        details
      );

      return subscription;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      
      if (error instanceof Error) {
        throw new InternalServerErrorException(`فشل في تمديد الاشتراك: ${error.message}`);
      }
      throw new InternalServerErrorException('فشل في تمديد الاشتراك: خطأ غير معروف');
    } finally {
      await queryRunner.release();
    }
  }
}