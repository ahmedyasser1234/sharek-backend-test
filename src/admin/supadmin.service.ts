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
import { ManagerToken } from './entities/manager-token.entity'
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
  Companies: number;
  Employees: number;
  activeSubscriptions: number;
  Sellers: number;
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

export interface ManagerWithoutPassword {
  email: string;
  role: ManagerRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: Admin;
  tokens?: ManagerToken[];
  activatedSubscriptions?: CompanySubscription[];
}

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
    @InjectRepository(ManagerToken) private readonly managerTokenRepo: Repository<ManagerToken>,
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

  async getSellerById(
    supadminId: string,
    sellerId: string
  ): Promise<{
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    companiesCount: number;
    activeSubscriptionsCount: number;
    createdBy?: string;
  }> {
    const supadmin = await this.supadminRepo.findOne({
      where: { id: supadminId }
    });

    if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
      throw new ForbiddenException('غير مصرح - لا تملك صلاحية عرض تفاصيل البائعين');
    }

    const seller = await this.sellerRepo.findOne({
      where: { id: sellerId },
      relations: ['createdBy']
    });

    if (!seller) {
      throw new NotFoundException('البائع غير موجود');
    }

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

  if (!dto || !dto.email || !dto.password) {
    throw new BadRequestException('البريد الإلكتروني وكلمة المرور مطلوبان');
  }

  const normalizedEmail = dto.email.toLowerCase().trim();
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new BadRequestException('صيغة البريد الإلكتروني غير صحيحة');
  }

  if (dto.password.length < 6) {
    throw new BadRequestException('كلمة المرور يجب أن تكون على الأقل 6 أحرف');
  }

  const existing = await this.sellerRepo.findOne({ 
    where: { email: normalizedEmail } 
  });
  
  if (existing) {
    throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
  }

  const hashedPassword = await bcrypt.hash(dto.password, 10);
  
  try {
    const seller = this.sellerRepo.create({
      email: normalizedEmail,
      password: hashedPassword,
      role: ManagerRole.SELLER,
      isActive: true,
      createdBy: supadmin,    
    });

    const savedSeller = await this.sellerRepo.save(seller);
    const sellerId = savedSeller.id;

    if (!sellerId) {
      throw new InternalServerErrorException('فشل في الحصول على معرف البائع');
    }

    this.logger.log(`تم إنشاء بائع جديد: ${savedSeller.email} بواسطة المسؤول الأعلى: ${supadmin.email}`);
    
    try {
      await this.sendSupadminActionEmail(
        'created',
        `تم إنشاء بائع جديد: ${savedSeller.email} بكلمة مرور مؤقتة: ${dto.password}`,
        supadmin.email,
        savedSeller.email,
        'seller',
        [savedSeller.email]
      );
    } catch (emailError: unknown) {
      const emailErrorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      this.logger.warn(`فشل إرسال إيميل البائع الجديد: ${emailErrorMessage}`);
    }

    return { success: true, sellerId };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل إنشاء البائع: ${errorMessage}`);
    
    if (errorMessage.includes('foreign key constraint')) {
      this.logger.warn('خطأ في المفتاح الأجنبي، محاولة طريقة بديلة...');
      
      return this.createSellerWithoutRelation(supadmin, normalizedEmail, hashedPassword, dto.password);
    }
    
    throw new InternalServerErrorException('فشل في إنشاء البائع');
  }
}

private async createSellerWithoutRelation(
  supadmin: Supadmin,
  email: string,
  hashedPassword: string,
  plainPassword: string
): Promise<{ success: boolean; sellerId: string }> {
  try {
    const seller = this.sellerRepo.create({
      email: email,
      password: hashedPassword,
      role: ManagerRole.SELLER,
      isActive: true,
    });

    const savedSeller = await this.sellerRepo.save(seller);
    const sellerId = savedSeller.id;

    if (!sellerId) {
      throw new InternalServerErrorException('فشل في الحصول على معرف البائع بالطريقة البديلة');
    }

    this.logger.log(`تم إنشاء بائع جديد بدون علاقة: ${email} بواسطة المسؤول الأعلى: ${supadmin.email}`);
    
    try {
      await this.sendSupadminActionEmail(
        'created',
        `تم إنشاء بائع جديد: ${email} بكلمة مرور مؤقتة: ${plainPassword}`,
        supadmin.email,
        email,
        'seller',
        [email]
      );
    } catch (emailError: unknown) {
      const emailErrorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      this.logger.warn(`فشل إرسال إيميل: ${emailErrorMessage}`);
    }

    return { success: true, sellerId };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل الطريقة البديلة: ${errorMessage}`);
    throw new InternalServerErrorException('فشل في إنشاء البائع حتى بالطريقة البديلة');
  }
}

async updateSeller(
  supadminId: string,
  sellerId: string,
  dto: Partial<{
    email: string;
    password: string;
    isActive?: boolean;
  }>
): Promise<ManagerWithoutPassword> {
  const supadmin = await this.supadminRepo.findOne({
    where: { id: supadminId }
  });

  if (!supadmin || !this.hasPermission(supadmin, 'manage_sellers')) {
    throw new ForbiddenException('غير مصرح - لا تملك صلاحية تحديث البائعين');
  }

  this.logger.log(`بدء تحديث البائع ${sellerId} بواسطة ${supadmin.email}`);
  this.logger.log(`بيانات التحديث: ${JSON.stringify(dto)}`);

  const seller = await this.sellerRepo.findOne({ 
    where: { id: sellerId },
    relations: ['createdBy']
  });

  if (!seller) {
    throw new NotFoundException('البائع غير موجود');
  }

  this.logger.log(`البائع الحالي: ${seller.email}, النشط: ${seller.isActive}`);

  // تحديث البريد الإلكتروني
  if (dto.email && dto.email !== seller.email) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new BadRequestException('صيغة البريد الإلكتروني غير صحيحة');
    }
    
    const emailExists = await this.sellerRepo.findOne({ 
      where: { email: normalizedEmail } 
    });
    
    if (emailExists && emailExists.id !== sellerId) {
      throw new ConflictException('البريد الإلكتروني مستخدم بالفعل من قبل بائع آخر');
    }
    
    this.logger.log(`تغيير البريد من ${seller.email} إلى ${normalizedEmail}`);
    seller.email = normalizedEmail;
  }

  // تحديث كلمة المرور
  if (dto.password) {
    if (dto.password.length < 6) {
      throw new BadRequestException('كلمة المرور يجب أن تكون على الأقل 6 أحرف');
    }
    this.logger.log(`تغيير كلمة المرور للبائع ${seller.email}`);
    const oldPasswordHash = seller.password.substring(0, 20); // أول 20 حرف فقط للـ log
    seller.password = await bcrypt.hash(dto.password, 10);
    const newPasswordHash = seller.password.substring(0, 20);
    this.logger.log(`كلمة المرور القديمة (جزئي): ${oldPasswordHash}...`);
    this.logger.log(`كلمة المرور الجديدة (جزئي): ${newPasswordHash}...`);
    
    try {
      await this.managerTokenRepo.delete({ manager: { id: sellerId } });
      this.logger.log(`تم إلغاء جميع جلسات البائع ${seller.email} بعد تغيير كلمة المرور`);
    } catch (tokenError: unknown) {
      const tokenErrorMessage = tokenError instanceof Error ? tokenError.message : 'Unknown error';
      this.logger.error(`فشل حذف التوكنات: ${tokenErrorMessage}`);
    }
  }
  
  // تحديث الحالة
  if (dto.isActive !== undefined) {
    this.logger.log(`تغيير حالة البائع من ${seller.isActive} إلى ${dto.isActive}`);
    seller.isActive = dto.isActive;
  }

  // تحديث تاريخ التعديل
  seller.updatedAt = new Date();

  try {
    this.logger.log(`محاولة حفظ التغييرات للبائع ${seller.email}`);
    const updatedSeller = await this.sellerRepo.save(seller);
    this.logger.log(`تم حفظ التغييرات بنجاح`);
    this.logger.log(`البائع بعد الحفظ: ${updatedSeller.email}, النشط: ${updatedSeller.isActive}`);
    
    try {
      await this.sendSellerUpdateEmail(updatedSeller, dto);
    } catch (emailError: unknown) {
      const emailErrorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      this.logger.warn(`فشل إرسال إيميل التحديث: ${emailErrorMessage}`);
    }

    const { password, ...sellerWithoutPassword } = updatedSeller;
    
    this.logger.log(`تم تحديث البائع ${seller.email} بواسطة المسؤول الأعلى: ${supadmin.email}`);
    
    // التحقق من التحديث مرة أخرى
    const verifySeller = await this.sellerRepo.findOne({ 
      where: { id: sellerId } 
    });
    
    if (verifySeller) {
      this.logger.log(`التحقق بعد الحفظ - البريد: ${verifySeller.email}, النشط: ${verifySeller.isActive}`);
    } else {
      this.logger.error(`البائع غير موجود بعد الحفظ!`);
    }
    
    return {
      ...sellerWithoutPassword,
      tokens: [],
      activatedSubscriptions: []
    } as ManagerWithoutPassword;
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل تحديث البائع ${sellerId}: ${errorMessage}`);
    this.logger.error(`Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    
    if (errorMessage.includes('duplicate key') || errorMessage.includes('UNIQUE constraint')) {
      throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    }
    
    throw new InternalServerErrorException('فشل في تحديث بيانات البائع');
  }
}

private async sendSellerUpdateEmail(
  seller: Manager,
  dto: Partial<{
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    isActive?: boolean;
  }>
): Promise<void> {
  try {
    const changes: string[] = [];
    
    if (dto.email) changes.push('البريد الإلكتروني');
    if (dto.password) changes.push('كلمة المرور');
    if (dto.fullName) changes.push('الاسم الكامل');
    if (dto.phone) changes.push('رقم الهاتف');
    if (dto.isActive !== undefined) {
      changes.push(dto.isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
    }
    
    const subject = `تم تحديث بيانات حسابك - ${seller.email}`;
    const changesText = changes.length > 0 ? changes.join('، ') : 'بيانات الحساب';
    
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
          .content { background-color: white; padding: 20px; }
          .info-box { background-color: #f8f9fa; padding: 15px; margin-bottom: 15px; }
          .warning { color: #856404; background-color: #fff3cd; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>تحديث بيانات حساب البائع</h1>
          </div>
          <div class="content">
            <div class="info-box">
              <p><strong>عزيزي البائع:</strong> ${seller.email}</p>
              <p>تم تحديث ${changesText} في حسابك بواسطة المسؤول الأعلى.</p>
              <p><strong>التاريخ:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
            </div>
            
            ${dto.password ? `
            <div class="warning">
              <p><strong>ملاحظة هامة:</strong></p>
              <p>تم تسجيل خروجك من جميع الأجهزة بسبب تغيير كلمة المرور.</p>
              <p>يرجى تسجيل الدخول مرة أخرى باستخدام كلمة المرور الجديدة.</p>
            </div>
            ` : ''}
            
            <p>إذا لم تقم بهذه التغييرات، يرجى التواصل مع المسؤول الأعلى فوراً.</p>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <p>مع تحيات فريق الدعم الفني</p>
              <p>منصة شارك - أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
              <p>https://sharik-sa.com/</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail(seller.email, subject, html);
    this.logger.log(`تم إرسال إيميل تحديث البيانات للبائع: ${seller.email}`);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل إرسال إيميل تحديث البائع: ${errorMessage}`);
  }
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. حذف جميع التوكنات المرتبطة بالبائع
      await queryRunner.manager.delete(ManagerToken, { manager: { id: sellerId } });
      
      // 2. فصل جميع الاشتراكات عن البائع (تعيين activatedBySeller إلى null)
      await queryRunner.manager.update(
        CompanySubscription,
        { activatedBySeller: { id: sellerId } },
        { activatedBySeller: null }
      );
      
      // 3. حذف البائع نفسه
      await queryRunner.manager.delete(Manager, sellerId);
      
      // 4. تأكيد العملية
      await queryRunner.commitTransaction();

      await this.sendSupadminActionEmail(
        'deleted',
        `تم حذف حساب البائع: ${seller.email}`,
        supadmin.email,
        seller.email,
        'seller'
      );
      
      this.logger.log(`تم حذف البائع: ${seller.email} بواسطة المسؤول: ${supadmin.email}`);
      return { success: true };
      
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`فشل حذف البائع: ${errorMessage}`);
      throw new InternalServerErrorException('فشل في حذف البائع');
    } finally {
      await queryRunner.release();
    }
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

  // جلب جميع الاشتراكات مرة واحدة
  const allSubscriptions = await this.subRepo.find({
    relations: ['company', 'plan', 'activatedBySupadmin', 'activatedByAdmin', 'activatedBySeller'],
    order: { createdAt: 'DESC' }
  });

  // تجميع الاشتراكات حسب الشركة
  const subscriptionsByCompany = new Map<string, CompanySubscription[]>();
  
  allSubscriptions.forEach(subscription => {
    if (subscription.company) {
      const companyId = subscription.company.id;
      if (!subscriptionsByCompany.has(companyId)) {
        subscriptionsByCompany.set(companyId, []);
      }
      subscriptionsByCompany.get(companyId)!.push(subscription);
    }
  });

  // بناء الاستعلام - جلب كل الشركات
  const query = this.companyRepo.createQueryBuilder('company');

  // فلترة البحث فقط
  if (search) {
    query.where('(company.name LIKE :search OR company.email LIKE :search OR company.phone LIKE :search)', {
      search: `%${search}%`
    });
  }

  // فلترة الحالة (اختياري)
  if (status && status.trim() !== '') {
    query.andWhere('LOWER(company.subscriptionStatus) = LOWER(:status)', { 
      status: status.trim() 
    });
  }

  // الحصول على جميع الشركات مع الترتيب والصفحات
  const [companies, total] = await query
    .orderBy('company.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  this.logger.log(`جلب ${companies.length} شركة من أصل ${total} شركة (صفحة ${page})`);

  // تنسيق البيانات
  const formattedData = await Promise.all(
    companies.map(async (company) => {
      // جلب اشتراكات هذه الشركة (قد تكون موجودة أو لا)
      const companySubscriptions = subscriptionsByCompany.get(company.id) || [];
      const latestSubscription = companySubscriptions.length > 0 ? companySubscriptions[0] : null;

      // حساب عدد الموظفين
      const employeesCount = await this.employeeRepo.count({
        where: { company: { id: company.id } }
      });

      // تحديد من قام بالتفعيل
      const activatedBySupadmin = latestSubscription?.activatedBySupadmin;
      const activatedByAdmin = latestSubscription?.activatedByAdmin;
      const activatedBySeller = latestSubscription?.activatedBySeller;

      let activatedBy = 'لا يوجد اشتراك';
      let activatorType = 'لا يوجد';

      if (activatedBySupadmin) {
        activatedBy = `${activatedBySupadmin.email} (مسؤول أعلى)`;
        activatorType = 'مسؤول أعلى';
      } else if (activatedByAdmin) {
        activatedBy = `${activatedByAdmin.email} (أدمن)`;
        activatorType = 'أدمن';
      } else if (activatedBySeller) {
        activatedBy = `${activatedBySeller.email} (بائع)`;
        activatorType = 'بائع';
      }

      return {
        id: company.id,
        name: company.name || '',
        email: company.email || '',
        phone: company.phone || '',
        isActive: company.isActive,
        isVerified: company.isVerified,
        subscriptionStatus: company.subscriptionStatus || 'غير مشترك',
        employeesCount,
        activatedBy,
        activatorType,
        subscriptionDate: latestSubscription?.startDate || undefined,
        planName: latestSubscription?.plan?.name || 'لا يوجد',
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
      true, 
      undefined, 
      undefined, 
      supadminId, 
      supadmin.email 
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
    
    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof NotFoundException) {
      throw error;
    } else if (error instanceof ForbiddenException) {
      throw error;
    }
    
    throw new InternalServerErrorException('فشل في عملية الاشتراك');
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
      Companies,
      Employees,
      activeSubscriptions,
      Sellers,
    ] = await Promise.all([
      this.companyRepo.count(),
      this.employeeRepo.count(),
      this.subRepo.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.sellerRepo.count(),
    ]);

    return {
      Companies,
      Employees,
      activeSubscriptions,
      Sellers,
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
    this.logger.debug(`All permissions: ${JSON.stringify(permissions)}`);
    
    const hasPerm = permissions[permission] || false;
    this.logger.debug(`Has permission "${permission}": ${hasPerm}`);
    
    return hasPerm;
  }

  private getPermissions(supadmin: Supadmin): Record<string, boolean> {
    const basePermissions = {
      canManagePlans: false,
      canManageSellers: true,
      canManageCompanies: true,
      canManageSubscriptions: true,
      canManagePayments: true,
      canViewReports: true,
      canDownloadDatabase: false
    };

    this.logger.debug(`Base permissions for ${supadmin.email}: ${JSON.stringify(basePermissions)}`);
    
    // إرجاع كل الصلاحيات مع أسماء متوافقة مع الكود الحالي
    return {
      ...basePermissions,
      // أسماء الصلاحيات القديمة للتتوافق مع الكود الحالي
      manage_sellers: basePermissions.canManageSellers,
      manage_companies: basePermissions.canManageCompanies,
      manage_subscriptions: basePermissions.canManageSubscriptions,
      manage_payments: basePermissions.canManagePayments,
      manage_plans: basePermissions.canManagePlans,
      view_reports: basePermissions.canViewReports,
      download_database: basePermissions.canDownloadDatabase
    };
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

  async getSubscriptionHistory(
  supadminId: string,
  companyId: string
): Promise<CompanySubscription[]> {
  const supadmin = await this.supadminRepo.findOne({
    where: { id: supadminId }
  });

  if (!supadmin || !this.hasPermission(supadmin, 'manage_subscriptions')) {
    throw new ForbiddenException('غير مصرح - لا تملك صلاحية عرض سجل الاشتراكات');
  }

  try {
    const company = await this.companyRepo.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    const result = await this.subscriptionService.getSubscriptionHistory(companyId);
    
    this.logger.log(`تم جلب سجل الاشتراكات للشركة ${companyId} بواسطة المسؤول الأعلى ${supadmin.email}`);
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل جلب سجل الاشتراكات للشركة ${companyId}: ${errorMessage}`);
    
    if (error instanceof NotFoundException) {
      throw error;
    }
    
    throw new InternalServerErrorException('فشل جلب سجل الاشتراكات');
  }
}

async getPaymentProofDetails(
  supadminId: string,
  proofId: string
): Promise<PaymentProofList> {
  const supadmin = await this.supadminRepo.findOne({
    where: { id: supadminId }
  });

  if (!supadmin || !this.hasPermission(supadmin, 'manage_payments')) {
    throw new ForbiddenException('غير مصرح - لا تملك صلاحية عرض تفاصيل المدفوعات');
  }

  try {
    const proof = await this.paymentProofRepo.findOne({
      where: { id: proofId },
      relations: ['company', 'plan'],
    });

    if (!proof) {
      throw new NotFoundException('طلب الدفع غير موجود');
    }

    const safeProof: PaymentProofList = {
      id: proof.id,
      companyId: proof.company?.id || 'غير معروف',
      companyName: proof.company?.name || 'شركة غير معروفة',
      companyEmail: proof.company?.email || 'بريد غير معروف',
      planId: proof.plan?.id || 'غير معروف',
      planName: proof.plan?.name || 'خطة غير معروفة',
      imageUrl: proof.imageUrl,
      createdAt: proof.createdAt,
      status: proof.status,
      reviewed: proof.reviewed || false,
      rejected: proof.rejected || false,
      decisionNote: proof.decisionNote || undefined,
    };

    this.logger.log(`تم جلب تفاصيل طلب الدفع ${proofId} بواسطة المسؤول الأعلى ${supadmin.email}`);
    
    return safeProof;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.error(`فشل تحميل تفاصيل الطلب ${proofId}: ${errorMessage}`);
    
    if (err instanceof NotFoundException) {
      throw err;
    }
    
    throw new InternalServerErrorException('فشل تحميل تفاصيل الطلب');
  }
}


async getEmployeesByCompany(
  supadminId: string,
  companyId: string
): Promise<Employee[]> {
  const supadmin = await this.supadminRepo.findOne({
    where: { id: supadminId }
  });

  if (!supadmin || !this.hasPermission(supadmin, 'manage_companies')) {
    throw new ForbiddenException('غير مصرح - لا تملك صلاحية عرض موظفي الشركات');
  }

  try {
    const company = await this.companyRepo.findOne({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    const employees = await this.employeeRepo.find({
      where: { company: { id: companyId } },
      relations: ['company']
    });

    this.logger.log(`تم جلب ${employees.length} موظف للشركة ${companyId} بواسطة المسؤول الأعلى ${supadmin.email}`);
    
    return employees;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    this.logger.error(`فشل جلب موظفي الشركة ${companyId}: ${errorMessage}`);
    
    if (error instanceof NotFoundException) {
      throw error;
    }
    
    throw new InternalServerErrorException('فشل جلب الموظفين');
  }
}

}