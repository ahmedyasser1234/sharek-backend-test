/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Supadmin, SupadminRole } from './entities/supadmin.entity';
import { SupadminToken } from './entities/supadmin-token.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription, SubscriptionStatus } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { Manager, ManagerRole } from './entities/manager.entity';
import * as bcrypt from 'bcryptjs';
import { SupadminJwtService } from './auth/supadmin-jwt.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentService } from '../payment/payment.service';
import * as nodemailer from 'nodemailer';
import { Admin } from '../admin/entities/admin.entity';

export interface SubscriptionResult {
  message: string;
  redirectToDashboard?: boolean;
  redirectToPayment?: boolean;
  checkoutUrl?: string;
  subscription?: CompanySubscription;
}

export interface PaymentProofList {
  id: string;
  companyId: string;
  companyName: string;
  companyEmail: string;
  planId: string;
  planName: string;
  imageUrl: string;
  createdAt: Date;
  status: string;
  reviewed: boolean;
  rejected: boolean;
  decisionNote?: string;
}

export interface ApproveRejectResult {
  message: string;
}

export interface CompanyWithEmployeeCount {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  isVerified: boolean;
  subscriptionStatus: string;
  employeesCount: number;
  activatedBy?: string;
  activatorType?: string;
  subscriptionDate?: Date;
  planName?: string;
  adminEmail?: string;
  supadminEmail?: string;
}

export interface SupadminWithData {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
  role: SupadminRole;
  isActive: boolean;
  permissions: Record<string, boolean>;
  createdAt: Date;
  lastLoginAt?: Date;
  companies?: CompanyWithEmployeeCount[];
  refreshToken?: string;
}

export interface SystemStats {
  totalCompanies: number;
  activeCompanies: number;
  totalEmployees: number;
  activeSubscriptions: number;
  expiringSubscriptions: number;
  pendingPayments: number;
  totalSellers: number;
  activeSellers: number;
  totalSupadmins: number;
  monthlyRevenue: number;
}

export interface SellerList {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  companiesCount: number;
  activeSubscriptionsCount: number;
  createdBy?: string;
}

// تعريف أنواع الخدمات
type CancelSubscriptionResult = {
  message: string;
  cancelledSubscriptions: number;
  companyStatus: string;
  note: string;
  disconnectedPlans?: string[];
};

type ExtendSubscriptionResult = {
  message: string;
  subscription: CompanySubscription;
};

type PlanChangeValidation = {
  canChange: boolean;
  message: string;
  currentPlanMax: number;
  newPlanMax: number;
  currentEmployees: number;
  action: string;
};

@Injectable()
export class SupadminService {
  private readonly logger = new Logger(SupadminService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Supadmin) private readonly supadminRepo: Repository<Supadmin>,
    @InjectRepository(SupadminToken) private readonly tokenRepo: Repository<SupadminToken>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanySubscription) private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(PaymentProof) private readonly paymentProofRepo: Repository<PaymentProof>,
    @InjectRepository(Manager) private readonly sellerRepo: Repository<Manager>,
    private readonly supadminJwt: SupadminJwtService,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
  ) {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter(): void {
    try {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER || '',
          pass: process.env.EMAIL_PASS || '',
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false,
        },
      });
    } catch (error) {
      this.logger.error('فشل تهيئة مرسل الإيميل:', error);
    }
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      if (!this.emailTransporter || !process.env.EMAIL_USER) {
        this.logger.warn('مرسل الإيميل غير مهيأ، تخطي إرسال الإيميل');
        return;
      }

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
      });
      this.logger.log(`تم إرسال الإيميل إلى: ${to}`);
    } catch (error) {
      this.logger.error(`فشل إرسال الإيميل: ${error}`);
    }
  }

  private async sendPaymentApprovedEmail(
    companyEmail: string,
    companyName: string,
    planName: string,
    supadminEmail: string,
    amount: number
  ): Promise<void> {
    try {
      const subject = `تم قبول طلب الدفع - ${companyName}`;
      
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
              background-color: #28a745;
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
              border-right: 4px solid #28a745;
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
            .success-box {
              background-color: #d4edda;
              border: 1px solid #c3e6cb;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: center;
            }
            .success-title {
              color: #155724;
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
            .next-steps {
              background-color: #e8f5e9;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
            }
            .next-steps h3 {
              color: #2e7d32;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>تم قبول طلب الدفع بنجاح</h1>
            </div>
            
            <div class="content">
              <div class="success-box">
                <div class="success-title">تهانينا! تم تفعيل اشتراكك بنجاح</div>
                <p>يمكنك الآن الاستفادة من جميع مميزات الخطة</p>
              </div>

              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>البريد الإلكتروني:</strong> ${companyEmail}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>المبلغ:</strong> ${amount} ريال سعودي</p>
                <p><strong>تاريخ القبول:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>بواسطة المسؤول الأعلى:</strong> ${supadminEmail}</p>
              </div>
              
              <div class="next-steps">
                <h3>الخطوات التالية:</h3>
                <p>• تم تفعيل حسابك بالكامل</p>
                <p>• يمكنك تسجيل الدخول واستخدام المنصة فوراً</p>
                <p>• لمزيد من المساعدة، يمكنك التواصل مع فريق الدعم</p>
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

      await this.sendEmail(companyEmail, subject, html);
      this.logger.log(`تم إرسال إيميل قبول الدفع للشركة ${companyName}`);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل قبول الدفع: ${error}`);
    }
  }

  private async sendPaymentRejectedEmail(
    companyEmail: string,
    companyName: string,
    planName: string,
    supadminEmail: string,
    reason: string
  ): Promise<void> {
    try {
      const subject = `ملاحظة حول طلب الدفع - ${companyName}`;
      
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
              background-color: #dc3545;
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
              border-right: 4px solid #dc3545;
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
            .notice-box {
              background-color: #ffeaa7;
              border: 1px solid #fdcb6e;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .notice-title {
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
            .next-steps {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
            }
            .next-steps h3 {
              color: #333;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>ملاحظة حول طلب الدفع</h1>
            </div>
            
            <div class="content">
              <div class="notice-box">
                <div class="notice-title">طلبك يحتاج إلى مراجعة</div>
                <p>يرجى الاطلاع على الملاحظات أدناه وإعادة إرسال طلب الدفع</p>
              </div>

              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>البريد الإلكتروني:</strong> ${companyEmail}</p>
                <p><strong>الخطة المطلوبة:</strong> ${planName}</p>
                <p><strong>تاريخ المراجعة:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>بواسطة المسؤول الأعلى:</strong> ${supadminEmail}</p>
              </div>
              
              <div class="notice-box">
                <div class="notice-title">الملاحظات:</div>
                <p>${reason}</p>
              </div>
              
              <div class="next-steps">
                <h3>الخطوات التالية:</h3>
                <p>• يرجى تصحيح المشكلة المذكورة أعلاه</p>
                <p>• إعادة رفع إثبات الدفع عبر المنصة</p>
                <p>• إذا كنت بحاجة إلى مساعدة، يمكنك التواصل مع فريق الدعم</p>
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

      await this.sendEmail(companyEmail, subject, html);
      this.logger.log(`تم إرسال إيميل رفض الدفع للشركة ${companyName}`);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل رفض الدفع: ${error}`);
    }
  }

  private async sendPlanCreatedEmail(
    planName: string,
    planPrice: number,
    supadminEmail: string,
    toEmails: string[]
  ): Promise<void> {
    try {
      const subject = `إضافة خطة جديدة - ${planName}`;
      
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
              background-color: #17a2b8;
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
              border-right: 4px solid #17a2b8;
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
            .plan-details {
              background-color: #e8f5e9;
              padding: 20px,
              border-radius: 8px;
              margin: 20px 0;
            }
            .plan-details h3 {
              color: #2e7d32;
              margin-bottom: 10px;
            }
            .features-list {
              list-style: none;
              padding: 0;
              margin: 15px 0;
            }
            .features-list li {
              padding: 8px 0;
              border-bottom: 1px dashed #ddd;
            }
            .features-list li:last-child {
              border-bottom: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>إضافة خطة جديدة في منصة شارك</h1>
            </div>
            
            <div class="content">
              <div class="info-box">
                <p><strong>إشعار:</strong> تم إضافة خطة جديدة للاشتراك في المنصة</p>
                <p><strong>بواسطة المسؤول الأعلى:</strong> ${supadminEmail}</p>
                <p><strong>تاريخ الإضافة:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
              </div>

              <div class="plan-details">
                <h3>تفاصيل الخطة الجديدة:</h3>
                <p><strong>اسم الخطة:</strong> ${planName}</p>
                <p><strong>سعر الخطة:</strong> ${planPrice} ريال سعودي</p>
                <p><strong>الحالة:</strong> نشطة وجاهزة للاشتراك</p>
              </div>
              
              <div>
                <p>مع تحيات فريق الدعم الفني</p>
                <p>منصة شارك - أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>https://sharik-sa.com/</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      for (const email of toEmails) {
        if (email) {
          await this.sendEmail(email, subject, html);
        }
      }

      this.logger.log(`تم إرسال إيميل إضافة خطة جديدة إلى ${toEmails.length} مسؤول/بائع`);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل إضافة خطة: ${error}`);
    }
  }

  private async sendSupadminActionEmail(
    action: string,
    details: string,
    supadminEmail: string,
    target: string,
    targetType: 'company' | 'seller' | 'plan' | 'subscription',
    toEmails?: string[]
  ): Promise<void> {
    try {
      const actionTitles: Record<string, string> = {
        'created': 'إنشاء',
        'updated': 'تحديث',
        'deleted': 'حذف',
        'activated': 'تفعيل',
        'deactivated': 'تعطيل',
        'approved': 'موافقة',
        'rejected': 'رفض'
      };

      const subject = `${actionTitles[action] || 'إجراء'} - ${target}`;
      
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
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #777;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${actionTitles[action] || 'إجراء'} ${targetType === 'company' ? 'شركة' : 
                targetType === 'seller' ? 'بائع' : 
                targetType === 'plan' ? 'خطة' : 'اشتراك'}</h1>
            </div>
            
            <div class="content">
              <div class="info-box">
                <p><strong>${targetType === 'company' ? 'الشركة' : 
                  targetType === 'seller' ? 'البائع' : 
                  targetType === 'plan' ? 'الخطة' : 'الاشتراك'}:</strong> ${target}</p>
                <p><strong>نوع الإجراء:</strong> ${actionTitles[action] || action}</p>
                <p><strong>بواسطة المسؤول الأعلى:</strong> ${supadminEmail}</p>
                <p><strong>التاريخ:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
              </div>
              
              <div class="action-details">
                <div class="details-title">تفاصيل الإجراء:</div>
                <p>${details}</p>
              </div>
              
              <div>
                <p>مع تحيات فريق الدعم الفني</p>
                <p>منصة شارك - أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>https://sharik-sa.com/</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      if (toEmails && toEmails.length > 0) {
        for (const email of toEmails) {
          if (email) {
            await this.sendEmail(email, subject, html);
          }
        }
        this.logger.log(`تم إرسال إيميل ${action} إلى ${toEmails.length} مستلم`);
      } else {
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER;
        if (adminEmail) {
          await this.sendEmail(adminEmail, subject, html);
          this.logger.log(`تم إرسال إيميل ${action} إلى الإيميل الرئيسي`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل إرسال إيميل ${action}: ${errorMessage}`);
    }
  }

  async ensureDefaultSupadmin(): Promise<void> {
    const defaultEmail = 'superadmin@system.local';
    const normalizedEmail = defaultEmail.toLowerCase().trim();
    
    const exists = await this.supadminRepo.findOne({ 
      where: { email: normalizedEmail } 
    });
    
    if (exists) return;

    const hashedPassword = await bcrypt.hash('Admin@1234', 10);
    const supadmin = this.supadminRepo.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: SupadminRole.SUPER_ADMIN,
      isActive: true,
    });

    await this.supadminRepo.save(supadmin);
    this.logger.log(`تم إنشاء المسؤول الأعلى الأساسي: ${defaultEmail}`);
  }

  async login(
    email: string, 
    password: string, 
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ 
    accessToken: string; 
    refreshToken: string; 
    supadmin: SupadminWithData;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    
    const supadmin = await this.supadminRepo.findOne({ 
      where: { email: normalizedEmail } 
    });
    
    if (!supadmin || !(await bcrypt.compare(password, supadmin.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (!supadmin.isActive) {
      throw new UnauthorizedException('الحساب غير نشط، يرجى التواصل مع المسؤول');
    }

    const tokens = this.supadminJwt.generateInitialTokens(supadmin);

    const tokenEntity = new SupadminToken();
    tokenEntity.supadmin = supadmin;
    tokenEntity.refreshToken = tokens.refreshToken;
    tokenEntity.ipAddress = ipAddress || '';
    tokenEntity.userAgent = userAgent || '';
    tokenEntity.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await this.tokenRepo.save(tokenEntity);

    let companies: CompanyWithEmployeeCount[] = [];
    if (this.hasPermission(supadmin, 'manage_companies')) {
      companies = await this.getSupadminCompanies(supadmin.id);
    }

    const supadminData: SupadminWithData = {
      id: supadmin.id,
      email: supadmin.email,
      role: supadmin.role,
      isActive: supadmin.isActive,
      permissions: this.getPermissions(supadmin),     
      createdAt: supadmin.createdAt,
      companies,
      refreshToken: tokens.refreshToken,
    };

    this.logger.log(`تم تسجيل دخول المسؤول الأعلى: ${supadmin.email} من IP: ${ipAddress}`);

    return { 
      accessToken: tokens.accessToken, 
      refreshToken: tokens.refreshToken, 
      supadmin: supadminData
    };
  }

  async refresh(refreshToken: string): Promise<{ 
    accessToken: string;
    supadmin: SupadminWithData;
  }> {
    const token = await this.tokenRepo.findOne({
      where: { refreshToken },
      relations: ['supadmin'],
    });

    if (!token) {
      this.logger.error(`Refresh token not found: ${refreshToken}`);
      throw new UnauthorizedException('توكن غير صالح');
    }

    if (!token.supadmin.isActive) {
      this.logger.error(`Supadmin is inactive: ${token.supadmin.id}`);
      throw new UnauthorizedException('الحساب غير نشط');
    }

    try {
      const payload = this.supadminJwt.verifyRefresh(refreshToken);
      
      if (!payload || payload.supadminId !== token.supadmin.id) {
        this.logger.error(`Invalid refresh token for supadmin: ${token.supadmin.id}`);
        throw new UnauthorizedException('توكن غير صالح');
      }

      const newAccessToken = this.supadminJwt.signAccess({
        supadminId: token.supadmin.id,
        role: token.supadmin.role,
        permissions: this.getPermissions(token.supadmin), 
      });
      
      let companies: CompanyWithEmployeeCount[] = [];
      if (this.hasPermission(token.supadmin, 'manage_companies')) {
        companies = await this.getSupadminCompanies(token.supadmin.id);
      }
      
      const supadminData: SupadminWithData = {
        id: token.supadmin.id,
        email: token.supadmin.email,
        role: token.supadmin.role,
        isActive: token.supadmin.isActive,
        permissions: this.getPermissions(token.supadmin), 
        createdAt: token.supadmin.createdAt,
        companies: companies,
        refreshToken: refreshToken,
      };

      this.logger.log(`تم تجديد التوكن للمسؤول الأعلى: ${token.supadmin.email}`);
      
      return { 
        accessToken: newAccessToken, 
        supadmin: supadminData 
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل تجديد التوكن: ${errorMessage}`);
      
      await this.tokenRepo.delete({ refreshToken });
      
      throw new UnauthorizedException('توكن منتهي الصلاحية أو غير صالح');
    }
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.tokenRepo.delete({ refreshToken });
    this.logger.log('تم تسجيل الخروج بنجاح');
    return { success: true };
  }

  async logoutAll(supadminId: string): Promise<{ success: boolean; deleted: number }> {
    const result = await this.tokenRepo.delete({ supadmin: { id: supadminId } });
    this.logger.log(`تم تسجيل الخروج من جميع الأجهزة للمسؤول الأعلى: ${supadminId}`);
    return { success: true, deleted: result.affected || 0 };
  }

  async getProfile(supadminId: string): Promise<SupadminWithData> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    let companies: CompanyWithEmployeeCount[] = [];
    if (this.hasPermission(supadmin, 'manage_companies')) {
      companies = await this.getSupadminCompanies(supadmin.id);
    }

    return {
      id: supadmin.id,
      email: supadmin.email,
      role: supadmin.role,
      isActive: supadmin.isActive,
      permissions: this.getPermissions(supadmin), 
      createdAt: supadmin.createdAt,
      companies,
    };
  }

  async updateProfile(
    supadminId: string, 
    dto: {
      fullName?: string;
      phone?: string;
    }
  ): Promise<SupadminWithData> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    this.logger.warn('خاصية fullName و phone غير مدعومة في الكيان الحالي');

    return this.getProfile(supadminId);
  }

  async changePassword(
    supadminId: string, 
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin) {
      throw new NotFoundException('المسؤول الأعلى غير موجود');
    }

    if (!(await bcrypt.compare(oldPassword, supadmin.password))) {
      throw new UnauthorizedException('كلمة المرور القديمة غير صحيحة');
    }

    supadmin.password = await bcrypt.hash(newPassword, 10);
    await this.supadminRepo.save(supadmin);

    await this.logoutAll(supadminId);

    this.logger.log(`تم تغيير كلمة المرور للمسؤول الأعلى: ${supadmin.email}`);
    return { success: true };
  }

  async getAllSellers(
    supadminId: string,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<{ data: SellerList[]; total: number; page: number; totalPages: number }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة البائعين');
    }

    const query = this.sellerRepo.createQueryBuilder('seller')
      .leftJoinAndSelect('seller.createdBy', 'admin');

    if (search) {
      query.where('seller.email LIKE :search', { search: `%${search}%` });
    }

    const [sellers, total] = await query
      .orderBy('seller.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedData = await Promise.all(
      sellers.map(async (seller) => {
        const companiesCount = await this.subRepo.count({
          where: { activatedBySellerId: seller.id }
        });

        const activeSubscriptionsCount = await this.subRepo.count({
          where: { 
            activatedBySellerId: seller.id,
            status: SubscriptionStatus.ACTIVE
          }
        });

        return {
          id: seller.id,
          email: seller.email,
          role: seller.role,
          isActive: seller.isActive,
          createdAt: seller.createdAt,
          companiesCount,
          activeSubscriptionsCount,
          createdBy: seller.createdBy?.email,
        };
      })
    );

    return {
      data: formattedData,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createSeller(
    supadminId: string,
    dto: { email: string; password: string }
  ): Promise<{ success: boolean; sellerId: string }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إنشاء بائعين');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.sellerRepo.findOne({ 
      where: { email: normalizedEmail } 
    });
    
    if (existing) {
      throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    
    const seller = this.sellerRepo.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: ManagerRole.SELLER,
      isActive: true,
      createdBy: supadmin,
    });

    await this.sellerRepo.save(seller);

    await this.sendSupadminActionEmail(
      'created',
      `تم إنشاء بائع جديد: ${seller.email} بكلمة مرور مؤقتة: ${dto.password}`,
      supadmin.email,
      seller.email,
      'seller',
      [seller.email]
    );

    this.logger.log(`تم إنشاء بائع جديد: ${seller.email} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true, sellerId: seller.id };
  }

  async toggleSellerStatus(
    supadminId: string,
    sellerId: string,
    isActive: boolean
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة البائعين');
    }

    const seller = await this.sellerRepo.findOne({
      where: { id: sellerId }
    });

    if (!seller) {
      throw new NotFoundException('البائع غير موجود');
    }

    await this.sellerRepo.update(sellerId, { isActive });

    const action = isActive ? 'activated' : 'deactivated';
    await this.sendSupadminActionEmail(
      action,
      `تم ${isActive ? 'تفعيل' : 'تعطيل'} حساب البائع: ${seller.email}`,
      supadmin.email,
      seller.email,
      'seller',
      [seller.email]
    );
    
    this.logger.log(`تم ${isActive ? 'تفعيل' : 'تعطيل'} البائع: ${seller.email} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true };
  }

  async deleteSeller(
    supadminId: string,
    sellerId: string
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية حذف البائعين');
    }

    const seller = await this.sellerRepo.findOne({
      where: { id: sellerId }
    });

    if (!seller) {
      throw new NotFoundException('البائع غير موجود');
    }

    await this.sellerRepo.delete(sellerId);

    await this.sendSupadminActionEmail(
      'deleted',
      `تم حذف حساب البائع: ${seller.email}`,
      supadmin.email,
      seller.email,
      'seller'
    );
    
    this.logger.log(`تم حذف البائع: ${seller.email} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true };
  }

  async getSupadminCompanies(supadminId: string): Promise<CompanyWithEmployeeCount[]> {
    const subscriptions = await this.subRepo.find({
      where: { activatedBySupadminId: supadminId },
      relations: ['company', 'plan', 'activatedBySupadmin', 'activatedByAdmin'],
    });

    const result = await Promise.all(
      subscriptions.map(async (sub) => {
        if (!sub.company) {
          this.logger.warn(`Subscription ${sub.id} has no company relation`);
          return null;
        }

        const employeesCount = await this.employeeRepo.count({
          where: { company: { id: sub.company.id } }
        });

        const activatedBySupadmin = sub.activatedBySupadmin;
        const activatedByAdmin = sub.activatedByAdmin;

        return {
          id: sub.company.id,
          name: sub.company.name || '',
          email: sub.company.email || '',
          phone: sub.company.phone || '',
          isActive: sub.company.isActive,
          isVerified: sub.company.isVerified,
          subscriptionStatus: sub.company.subscriptionStatus || '',
          employeesCount,
          activatedBy: activatedBySupadmin ? 
            `${activatedBySupadmin.email} (مسؤول أعلى)` : 
            (activatedByAdmin ? `${activatedByAdmin.email} (أدمن)` : 'غير معروف'),
          activatorType: activatedBySupadmin ? 'مسؤول أعلى' : (activatedByAdmin ? 'أدمن' : 'غير معروف'),
          subscriptionDate: sub.startDate || undefined,
          planName: sub.plan?.name || 'غير معروف',
          adminEmail: activatedByAdmin?.email,
          supadminEmail: activatedBySupadmin?.email
        };
      })
    );

    return result.filter(company => company !== null) as CompanyWithEmployeeCount[];
  }

  async getAllCompanies(
    supadminId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string
  ): Promise<{ data: CompanyWithEmployeeCount[]; total: number; page: number; totalPages: number }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_companies')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الشركات');
    }

    const query = this.companyRepo.createQueryBuilder('company')
      .leftJoinAndSelect('company.subscriptions', 'subscriptions')
      .leftJoinAndSelect('subscriptions.plan', 'plan')
      .leftJoinAndSelect('subscriptions.activatedBySupadmin', 'supadmin')
      .leftJoinAndSelect('subscriptions.activatedByAdmin', 'admin')
      .leftJoinAndSelect('subscriptions.activatedBySeller', 'seller');

    if (search) {
      query.where('(company.name LIKE :search OR company.email LIKE :search OR company.phone LIKE :search)', {
        search: `%${search}%`
      });
    }

    if (status) {
      query.andWhere('company.subscriptionStatus = :status', { status });
    }

    const [companies, total] = await query
      .orderBy('company.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedData = await Promise.all(
      companies.map(async (company) => {
        const employeesCount = await this.employeeRepo.count({
          where: { company: { id: company.id } }
        });

        const subscription = company.subscriptions?.[0]; 

        const activatedBySupadmin = subscription?.activatedBySupadmin;
        const activatedByAdmin = subscription?.activatedByAdmin;
        const activatedBySeller = subscription?.activatedBySeller;

        return {
          id: company.id,
          name: company.name || '',
          email: company.email || '',
          phone: company.phone || '',
          isActive: company.isActive,
          isVerified: company.isVerified,
          subscriptionStatus: company.subscriptionStatus || '',
          employeesCount,
          activatedBy: activatedBySupadmin ? 
            `${activatedBySupadmin.email} (مسؤول أعلى)` : 
            activatedByAdmin ? `${activatedByAdmin.email} (أدمن)` :
            activatedBySeller ? `${activatedBySeller.email} (بائع)` :
            'غير معروف',
          activatorType: activatedBySupadmin ? 'مسؤول أعلى' : 
            activatedByAdmin ? 'أدمن' :
            activatedBySeller ? 'بائع' : 'غير معروف',
          subscriptionDate: subscription?.startDate || undefined,
          planName: subscription?.plan?.name || 'غير معروف',
          adminEmail: activatedByAdmin?.email,
          supadminEmail: activatedBySupadmin?.email
        };
      })
    );

    return {
      data: formattedData,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async toggleCompanyStatus(
    supadminId: string,
    companyId: string,
    isActive: boolean
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_companies')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الشركات');
    }

    const company = await this.companyRepo.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    await this.companyRepo.update(companyId, { isActive });

    const action = isActive ? 'activated' : 'deactivated';
    await this.sendSupadminActionEmail(
      action,
      `تم ${isActive ? 'تفعيل' : 'تعطيل'} الشركة: ${company.name}`,
      supadmin.email,
      company.name || '',
      'company',
      [company.email || '']
    );
    
    this.logger.log(`تم ${isActive ? 'تفعيل' : 'تعطيل'} الشركة: ${company.name} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true };
  }

  async deleteCompany(
    supadminId: string,
    companyId: string
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_companies')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية حذف الشركات');
    }

    const company = await this.companyRepo.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(Employee, { company: { id: companyId } });
      await queryRunner.manager.delete(CompanySubscription, { company: { id: companyId } });
      await queryRunner.manager.delete(Company, { id: companyId });

      await queryRunner.commitTransaction();

      await this.sendSupadminActionEmail(
        'deleted',
        `تم حذف الشركة: ${company.name} وجميع بياناتها`,
        supadmin.email,
        company.name || '',
        'company'
      );

      this.logger.log(`تم حذف الشركة: ${company.name} بواسطة المسؤول: ${supadmin.email}`);
      return { success: true };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل حذف الشركة: ${errorMessage}`);
      throw new InternalServerErrorException('فشل في حذف الشركة');
    } finally {
      await queryRunner.release();
    }
  }

  async getAllSubscriptions(
    supadminId: string,
    page: number = 1,
    limit: number = 10,
    status?: SubscriptionStatus,
    search?: string
  ): Promise<{ data: CompanySubscription[]; total: number; page: number; totalPages: number }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الاشتراكات');
    }

    const query = this.subRepo.createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.company', 'company')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .leftJoinAndSelect('subscription.activatedBySupadmin', 'supadmin')
      .leftJoinAndSelect('subscription.activatedByAdmin', 'admin')
      .leftJoinAndSelect('subscription.activatedBySeller', 'seller');

    if (status) {
      query.where('subscription.status = :status', { status });
    }

    if (search) {
      query.andWhere('(company.name LIKE :search OR company.email LIKE :search)', {
        search: `%${search}%`
      });
    }

    const [subscriptions, total] = await query
      .orderBy('subscription.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: subscriptions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async subscribeCompanyToPlan(
    supadminId: string,
    companyId: string,
    planId: string
  ): Promise<SubscriptionResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الاشتراكات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يشترك بالشركة ${companyId} في الخطة ${planId}`);
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        false,  
        undefined, 
        supadminId
      );
      
      this.logger.log(`تم الاشتراك بنجاح للشركة ${companyId} في الخطة ${planId} بواسطة المسؤول الأعلى ${supadmin.email}`);
      
      if (result && typeof result === 'object' && 'message' in result) {
        const subscriptionResult = result as SubscriptionResult;
        return {
          message: subscriptionResult.message,
          redirectToDashboard: subscriptionResult.redirectToDashboard,
          redirectToPayment: subscriptionResult.redirectToPayment,
          checkoutUrl: subscriptionResult.checkoutUrl,
          subscription: subscriptionResult.subscription,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الاشتراك');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل اشتراك الشركة ${companyId} في الخطة ${planId}: ${errorMessage}`);
      throw error;
    }
  }

  async cancelSubscription(
    supadminId: string,
    companyId: string
  ): Promise<CancelSubscriptionResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الاشتراكات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يلغي اشتراك الشركة ${companyId}`);
      
      const result = await this.subscriptionService.cancelSubscription(companyId) as CancelSubscriptionResult;
      
      if (this.isCancelSubscriptionResult(result)) {
        this.logger.log(`تم إلغاء اشتراك الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة الإلغاء');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل إلغاء اشتراك الشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async extendSubscription(
    supadminId: string,
    companyId: string
  ): Promise<ExtendSubscriptionResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الاشتراكات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يمدد اشتراك الشركة ${companyId}`);
      
      const result = await this.subscriptionService.extendSubscription(companyId) as ExtendSubscriptionResult;
      
      if (this.isExtendSubscriptionResult(result)) {
        this.logger.log(`تم تمديد اشتراك الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة التمديد');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل تمديد اشتراك الشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async changeSubscriptionPlan(
    supadminId: string,
    companyId: string,
    newPlanId: string
  ): Promise<SubscriptionResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الاشتراكات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يغير خطة الشركة ${companyId} إلى ${newPlanId}`);
      
      const result = await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId) as SubscriptionResult;
      
      if (result && typeof result.message === 'string') {
        this.logger.log(`تم تغيير خطة الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة تغيير الخطة');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل تغيير خطة الشركة ${companyId}: ${errorMessage}`);
      throw error;
    }
  }

  async getAllPlans(
    supadminId: string,
    page: number = 1,
    limit: number = 10,
    search?: string
  ): Promise<{ data: Plan[]; total: number; page: number; totalPages: number }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_plans')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الخطط');
    }

    const query = this.planRepo.createQueryBuilder('plan')
      .leftJoinAndSelect('plan.createdBySupadmin', 'supadmin');

    if (search) {
      query.where('plan.name LIKE :search', { search: `%${search}%` });
    }

    const [plans, total] = await query
      .orderBy('plan.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: plans,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createPlan(
    supadminId: string,
    planData: Partial<Plan>
  ): Promise<Plan> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_plans')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إنشاء خطط');
    }

    const plan = this.planRepo.create({
      ...planData,
      createdBySupadmin: supadmin,
    });

    const savedPlan = await this.planRepo.save(plan);
    
    this.logger.log(`تم إنشاء خطة جديدة: ${savedPlan.name} بواسطة المسؤول: ${supadmin.email}`);
    
    const sellers = await this.sellerRepo.find({ 
      where: { isActive: true },
      select: ['email']
    });

    const sellerEmails = sellers.map(seller => seller.email).filter(email => email);
    
    if (sellerEmails.length > 0) {
      await this.sendPlanCreatedEmail(
        savedPlan.name,
        savedPlan.price,
        supadmin.email,
        sellerEmails
      );
    }

    return savedPlan;
  }

  async updatePlan(
    supadminId: string,
    planId: string,
    planData: Partial<Plan>
  ): Promise<Plan> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_plans')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية تعديل الخطط');
    }

    await this.planRepo.update(planId, planData);
    const plan = await this.planRepo.findOne({
      where: { id: planId },
      relations: ['createdBySupadmin']
    });

    if (!plan) {
      throw new NotFoundException('الخطة غير موجودة');
    }

    await this.sendSupadminActionEmail(
      'updated',
      `تم تحديث خطة: ${plan.name}`,
      supadmin.email,
      plan.name,
      'plan',
      [supadmin.email]
    );

    this.logger.log(`تم تحديث الخطة: ${plan.name} بواسطة المسؤول: ${supadmin.email}`);
    return plan;
  }

  async togglePlanStatus(
    supadminId: string,
    planId: string,
    isActive: boolean
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_plans')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة الخطط');
    }

    const plan = await this.planRepo.findOne({
      where: { id: planId }
    });

    if (!plan) {
      throw new NotFoundException('الخطة غير موجودة');
    }

    await this.planRepo.update(planId, { isActive });

    const action = isActive ? 'activated' : 'deactivated';
    await this.sendSupadminActionEmail(
      action,
      `تم ${isActive ? 'تفعيل' : 'تعطيل'} خطة: ${plan.name}`,
      supadmin.email,
      plan.name,
      'plan',
      [supadmin.email]
    );
    
    this.logger.log(`تم ${isActive ? 'تفعيل' : 'تعطيل'} الخطة: ${planId} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true };
  }

  async deletePlan(
    supadminId: string,
    planId: string
  ): Promise<{ success: boolean }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_plans')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية حذف الخطط');
    }

    const plan = await this.planRepo.findOne({
      where: { id: planId }
    });

    if (!plan) {
      throw new NotFoundException('الخطة غير موجودة');
    }

    const subscriptionsCount = await this.subRepo.count({
      where: { plan: { id: planId } }
    });

    if (subscriptionsCount > 0) {
      throw new BadRequestException('لا يمكن حذف الخطة لأنها مرتبطة باشتراكات');
    }

    await this.planRepo.delete(planId);

    await this.sendSupadminActionEmail(
      'deleted',
      `تم حذف خطة: ${plan.name}`,
      supadmin.email,
      plan.name,
      'plan',
      [supadmin.email]
    );
    
    this.logger.log(`تم حذف الخطة: ${planId} بواسطة المسؤول: ${supadmin.email}`);
    return { success: true };
  }

  async getAllPaymentProofs(
    supadminId: string,
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ data: PaymentProofList[]; total: number; page: number; totalPages: number }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_payments')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة المدفوعات');
    }

    const query = this.paymentProofRepo.createQueryBuilder('proof')
      .leftJoinAndSelect('proof.company', 'company')
      .leftJoinAndSelect('proof.plan', 'plan');

    if (status) {
      query.where('proof.status = :status', { status });
    }

    const [proofs, total] = await query
      .orderBy('proof.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const formattedData = proofs.map((proof) => ({
      id: proof.id,
      companyId: proof.company?.id || 'غير معروف',
      companyName: proof.company?.name || 'شركة غير معروفة',
      companyEmail: proof.company?.email || 'بريد غير معروف',
      planId: proof.plan?.id || 'غير معروف',
      planName: proof.plan?.name || 'خطة غير معروفة',
      imageUrl: proof.imageUrl,
      createdAt: proof.createdAt,
      status: proof.status,
      reviewed: proof.reviewed,
      rejected: proof.rejected,
      decisionNote: proof.decisionNote || undefined,
    }));

    return {
      data: formattedData,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approvePaymentProof(
    supadminId: string,
    proofId: string
  ): Promise<ApproveRejectResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_payments')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة المدفوعات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يوافق على طلب الدفع ${proofId}`);
      
      const result = await this.paymentService.approveProof(proofId, supadminId);
      
      this.logger.log(`تم قبول الطلب ${proofId} بنجاح بواسطة المسؤول الأعلى ${supadmin.email}`);
      
      const proof = await this.paymentProofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (proof && proof.company && proof.plan) {
        await this.sendPaymentApprovedEmail(
          proof.company.email || '',
          proof.company.name || '',
          proof.plan.name,
          supadmin.email,
          proof.plan.price
        );
      }

      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
        return {
          message: result.message,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الموافقة');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل قبول الطلب ${proofId}: ${errorMessage}`);
      throw error;
    }
  }

  async rejectPaymentProof(
    supadminId: string,
    proofId: string,
    reason: string
  ): Promise<ApproveRejectResult> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_payments')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية إدارة المدفوعات');
    }

    try {
      this.logger.log(`المسؤول الأعلى ${supadmin.email} يرفض طلب الدفع ${proofId}`);
      
      const result = await this.paymentService.rejectProof(proofId, reason);
      
      this.logger.log(`تم رفض الطلب ${proofId} بنجاح`);
      
      const proof = await this.paymentProofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (proof && proof.company && proof.plan) {
        await this.sendPaymentRejectedEmail(
          proof.company.email || '',
          proof.company.name || '',
          proof.plan.name,
          supadmin.email,
          reason
        );
      }

      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
        return {
          message: result.message,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الرفض');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل رفض الطلب ${proofId}: ${errorMessage}`);
      throw error;
    }
  }

  async getSystemStats(supadminId: string): Promise<SystemStats> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'view_reports')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية عرض التقارير');
    }

    const [
      totalCompanies,
      activeCompanies,
      totalEmployees,
      activeSubscriptions,
      pendingPayments,
      totalSellers,
      activeSellers,
      totalSupadmins,
    ] = await Promise.all([
      this.companyRepo.count(),
      this.companyRepo.count({ where: { isActive: true } }),
      this.employeeRepo.count(),
      this.subRepo.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.paymentProofRepo.count({ where: { reviewed: false } }),
      this.sellerRepo.count(),
      this.sellerRepo.count({ where: { isActive: true } }),
      this.supadminRepo.count({ where: { isActive: true } }),
    ]);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const expiringSubscriptions = await this.subRepo.createQueryBuilder('sub')
      .where('sub.endDate <= :date', { date: sevenDaysFromNow })
      .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      .getCount();

    const monthlyRevenue = await this.calculateMonthlyRevenue();

    return {
      totalCompanies,
      activeCompanies,
      totalEmployees,
      activeSubscriptions,
      expiringSubscriptions,
      pendingPayments,
      totalSellers,
      activeSellers,
      totalSupadmins,
      monthlyRevenue,
    };
  }

  private async calculateMonthlyRevenue(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    const subscriptions = await this.subRepo.createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.startDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      .getMany();

    return subscriptions.reduce((total, sub) => total + (sub.plan?.price || 0), 0);
  }

  async exportDatabase(supadminId: string): Promise<{ success: boolean; message: string }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'download_database')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية تحميل قاعدة البيانات');
    }
    
    this.logger.log(`طلب تصدير قاعدة البيانات بواسطة المسؤول: ${supadmin.email}`);
    
    return {
      success: true,
      message: 'سيتم إعداد تصدير قاعدة البيانات وسيتم إعلامك عند اكتماله'
    };
  }

  private hasPermission(supadmin: Supadmin, permission: string): boolean {
    const permissions = this.getPermissions(supadmin);
    this.logger.debug(`Checking permission "${permission}" for ${supadmin.email}`);
    this.logger.debug(`Available permissions: ${JSON.stringify(permissions)}`);
    
    const hasPerm = permissions[permission] || false;
    this.logger.debug(`Has permission "${permission}": ${hasPerm}`);
    
    return hasPerm;
  }

  private getPermissions(supadmin: Supadmin): Record<string, boolean> {
    const permissions = {
      canManagePlans: false,          
      canManageSellers: true,          
      canManageCompanies: true,       
      canManageSubscriptions: true,     
      canManagePayments: true,        
      canViewReports: true,            
      canDownloadDatabase: false          
    };

    this.logger.debug(`Permissions for ${supadmin.email}: ${JSON.stringify(permissions)}`);
    
    return permissions;
  }

  private isCancelSubscriptionResult(obj: unknown): obj is CancelSubscriptionResult {
    if (obj && typeof obj === 'object') {
      const typedObj = obj as Record<string, unknown>;
      
      const hasRequiredFields = 
        typeof typedObj.message === 'string' &&
        typeof typedObj.cancelledSubscriptions === 'number' && 
        typeof typedObj.companyStatus === 'string' &&
        typeof typedObj.note === 'string';
      
      const hasOptionalField = 
        !('disconnectedPlans' in typedObj) || 
        Array.isArray(typedObj.disconnectedPlans);
      
      return hasRequiredFields && hasOptionalField;
    }
    return false;
  }

  private isExtendSubscriptionResult(obj: unknown): obj is ExtendSubscriptionResult {
    if (obj && typeof obj === 'object') {
      const typedObj = obj as Record<string, unknown>;
      return (
        typeof typedObj.message === 'string' &&
        'subscription' in typedObj &&
        typedObj.subscription !== null &&
        typeof typedObj.subscription === 'object'
      );
    }
    return false;
  }

  private isPlanChangeValidation(obj: unknown): obj is PlanChangeValidation {
    if (obj && typeof obj === 'object') {
      const typedObj = obj as Record<string, unknown>;
      return (
        typeof typedObj.canChange === 'boolean' &&
        typeof typedObj.message === 'string' &&
        typeof typedObj.currentPlanMax === 'number' &&
        typeof typedObj.newPlanMax === 'number' &&
        typeof typedObj.currentEmployees === 'number' &&
        typeof typedObj.action === 'string'
      );
    }
    return false;
  }
}