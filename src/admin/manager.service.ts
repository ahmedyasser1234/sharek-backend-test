/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Manager, ManagerRole } from './entities/manager.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription, SubscriptionStatus } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import { ManagerToken } from './entities/manager-token.entity';
import { ManagerJwtService } from './auth/manager-jwt.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentService } from '../payment/payment.service';
import { PaymentProof } from '../payment/entities/payment-proof.entity';
import { 
  CancelSubscriptionResult, 
  ExtendSubscriptionResult, 
  PlanChangeValidation 
} from '../subscription/subscription.service';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';

interface SubscriptionResult {
  message: string;
  redirectToDashboard?: boolean;
  redirectToPayment?: boolean;
  checkoutUrl?: string;
  subscription?: CompanySubscription;
}

interface PaymentProofList {
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

interface PaymentProofDetails {
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

interface ApproveRejectResult {
  message: string;
}

interface CompanyWithEmployeeCount {
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
  sellerEmail?: string;
}

export interface SellerWithCompanyData {
  id: string;
  email: string;
  role: ManagerRole;
  isActive: boolean;
  createdAt: Date;
  companies?: CompanyWithEmployeeCount[];
  refreshToken?: string;
}

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(Manager) private readonly sellerRepo: Repository<Manager>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanySubscription) private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(ManagerToken) private readonly tokenRepo: Repository<ManagerToken>,
    @InjectRepository(PaymentProof) private readonly paymentProofRepo: Repository<PaymentProof>,
    private readonly sellerJwt: ManagerJwtService,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentService: PaymentService,
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
      this.logger.log(`تم إرسال الإيميل إلى: ${to}`);
    } catch (error) {
      this.logger.error(`فشل إرسال الإيميل: ${error}`);
    }
  }

  private async sendSubscriptionActionEmail(
    companyEmail: string,
    companyName: string,
    sellerEmail: string,
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
                <p><strong>بواسطة البائع:</strong> ${sellerEmail}</p>
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
              <p><strong>بواسطة البائع:</strong> ${sellerEmail}</p>
              <p><strong>تفاصيل الإجراء:</strong> ${details}</p>
              <p><strong>التاريخ:</strong> ${new Date().toLocaleString('ar-SA')}</p>
            </div>
          </div>
        `;
        await this.sendEmail(companyAdminEmail, adminSubject, adminHtml);
      }

      this.logger.log(`تم إرسال إيميل ${actionText[action]} للشركة ${companyName}`);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل الإجراء ${action}:`, error);
    }
  }

  async ensureDefaultSeller(): Promise<void> {
    const defaultEmail = 'seller@system.local';
    const normalizedEmail = defaultEmail.toLowerCase().trim();
    
    const exists = await this.sellerRepo.findOne({ 
      where: { normalizedEmail: normalizedEmail } 
    });
    
    if (exists) return;

    const hashedPassword = await bcrypt.hash('seller123', 10);
    const seller = this.sellerRepo.create({
      email: normalizedEmail,
      normalizedEmail: normalizedEmail,
      password: hashedPassword,
      role: ManagerRole.SELLER,
    });

    await this.sellerRepo.save(seller);
    console.log(`تم إنشاء البائع الأساسي: ${defaultEmail}`);
  }

  async login(email: string, password: string): Promise<{ 
    accessToken: string; 
    refreshToken: string; 
    role: ManagerRole;
    seller: SellerWithCompanyData;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    
    const seller = await this.sellerRepo.findOne({ 
      where: { 
        normalizedEmail: normalizedEmail,
        isActive: true 
      } 
    });
    
    if (!seller || !(await bcrypt.compare(password, seller.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = { 
      managerId: seller.id, 
      role: seller.role,
      permissions: this.getPermissions(seller.role)
    };
    
    const accessToken = this.sellerJwt.signAccess(payload);
    const refreshToken = this.sellerJwt.signRefresh(payload);

    await this.tokenRepo.save({ manager: seller, refreshToken });

    const companies = await this.getSellerCompanies(seller.id);

    const sellerData: SellerWithCompanyData = {
      id: seller.id,
      email: seller.email,
      role: seller.role,
      isActive: seller.isActive,
      createdAt: seller.createdAt,
      companies: companies,
      refreshToken: refreshToken
    };

    return { 
      accessToken, 
      refreshToken, 
      role: seller.role,
      seller: sellerData
    };
  }

  async refresh(refreshToken: string): Promise<{ 
    accessToken: string;
    seller: SellerWithCompanyData;
  }> {
    const token = await this.tokenRepo.findOne({
      where: { refreshToken },
      relations: ['manager'],
    });

    if (!token) {
      this.logger.error(`Refresh token not found in database: ${refreshToken}`);
      throw new UnauthorizedException('توكن غير صالح');
    }

    if (!token.manager.isActive) {
      this.logger.error(`Manager is inactive: ${token.manager.id}`);
      throw new UnauthorizedException('البائع غير نشط');
    }

    try {
      const payload = this.sellerJwt.verifyRefresh(refreshToken);
      
      if (!payload) {
        this.logger.error(`Invalid refresh token signature: ${refreshToken}`);
        throw new UnauthorizedException('توكن غير صالح');
      }

      if (payload.managerId !== token.manager.id) {
        this.logger.error(`Token mismatch: payload=${payload.managerId}, db=${token.manager.id}`);
        throw new UnauthorizedException('توكن غير مطابق');
      }

      const newPayload = { 
        managerId: token.manager.id, 
        role: token.manager.role,
        permissions: this.getPermissions(token.manager.role)
      };
      
      const accessToken = this.sellerJwt.signAccess(newPayload);
      
      const companies = await this.getSellerCompanies(token.manager.id);
      
      const sellerData: SellerWithCompanyData = {
        id: token.manager.id,
        email: token.manager.email,
        role: token.manager.role,
        isActive: token.manager.isActive,
        createdAt: token.manager.createdAt,
        companies: companies,
        refreshToken: refreshToken
      };

      this.logger.log(`تم تجديد التوكن بنجاح للبائع: ${token.manager.email}`);
      
      return { 
        accessToken, 
        seller: sellerData 
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
    return { success: true };
  }

  async getSellerCompanies(sellerId: string): Promise<CompanyWithEmployeeCount[]> {
    const subscriptions = await this.subRepo.find({
      where: { activatedBySellerId: sellerId },
      relations: ['company', 'plan', 'activatedBySeller'],
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

        return {
          id: sub.company.id,
          name: sub.company.name,
          email: sub.company.email,
          phone: sub.company.phone,
          isActive: sub.company.isActive,
          isVerified: sub.company.isVerified,
          subscriptionStatus: sub.company.subscriptionStatus,
          employeesCount,
          activatedBy: sub.activatedBySeller ? 
            `${sub.activatedBySeller.email} (بائع)` : 
            (sub.activatedByAdmin ? `${sub.activatedByAdmin.email} (أدمن)` : 'غير معروف'),
          activatorType: sub.activatedBySeller ? 'بائع' : (sub.activatedByAdmin ? 'أدمن' : 'غير معروف'),
          subscriptionDate: sub.startDate,
          planName: sub.plan?.name || 'غير معروف',
          adminEmail: sub.activatedByAdmin?.email,
          sellerEmail: sub.activatedBySeller?.email
        };
      })
    );

    return result.filter(company => company !== null) as CompanyWithEmployeeCount[];
  }

  async getStats(sellerId?: string): Promise<{ 
    companies: number; 
    employees: number; 
    activeSubscriptions: number 
  }> {
    try {
      let companies = 0;
      let activeSubs = 0;
      let employees = 0;

      if (sellerId) {
        const sellerExists = await this.sellerRepo.exists({ where: { id: sellerId } });
        if (!sellerExists) {
          throw new NotFoundException(`البائع بالمعرف ${sellerId} غير موجود`);
        }

        const sellerSubscriptions = await this.subRepo.find({
          where: { activatedBySellerId: sellerId },
          relations: ['company']
        });
        
        companies = sellerSubscriptions.length;
        activeSubs = sellerSubscriptions.filter(sub => sub.status === SubscriptionStatus.ACTIVE).length;
        
        const companyIds = sellerSubscriptions
          .filter(sub => sub.company && sub.company.id)
          .map(sub => sub.company.id);
        
        if (companyIds.length > 0) {
          const uniqueCompanyIds = [...new Set(companyIds)];
          
          employees = await this.employeeRepo.count({
            where: { company: { id: In(uniqueCompanyIds) } }
          });
          
          this.logger.debug(`البائع ${sellerId}: ${companies} شركة، ${employees} موظف، ${activeSubs} اشتراك نشط`);
        } else {
          this.logger.debug(`البائع ${sellerId} ليس لديه شركات مرتبطة به`);
        }
      } else {
        companies = await this.companyRepo.count();
        activeSubs = await this.subRepo.count({
          where: { status: SubscriptionStatus.ACTIVE },
        });
        employees = await this.employeeRepo.count();
        
        this.logger.debug(`الإحصائيات العامة: ${companies} شركة، ${employees} موظف، ${activeSubs} اشتراك نشط`);
      }

      return { 
        companies, 
        employees, 
        activeSubscriptions: activeSubs 
      };
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الإحصائيات لـ sellerId=${sellerId}: ${errorMessage}`);
      
      return { 
        companies: 0, 
        employees: 0, 
        activeSubscriptions: 0 
      };
    }
  }

  async getAllCompaniesWithEmployeeCount(sellerId?: string): Promise<CompanyWithEmployeeCount[]> {
    let subscriptions: CompanySubscription[] = [];

    if (sellerId) {
      subscriptions = await this.subRepo.find({
        where: { activatedBySellerId: sellerId },
        relations: ['company', 'plan', 'activatedBySeller'],
      });
    } else {
      subscriptions = await this.subRepo.find({
        relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
      });
    }

    const result = await Promise.all(
      subscriptions.map(async (subscription) => {
        if (!subscription.company) {
          this.logger.warn(`Subscription ${subscription.id} has no company relation`);
          return null;
        }

        const count = await this.employeeRepo.count({ 
          where: { company: { id: subscription.company.id } } 
        });

        return {
          id: subscription.company.id,
          name: subscription.company.name,
          email: subscription.company.email,
          phone: subscription.company.phone,
          isActive: subscription.company.isActive,
          isVerified: subscription.company.isVerified,
          subscriptionStatus: subscription.company.subscriptionStatus,
          employeesCount: count,
          activatedBy: subscription.activatedBySeller ? 
            `${subscription.activatedBySeller.email} (بائع)` : 
            (subscription.activatedByAdmin ? `${subscription.activatedByAdmin.email} (أدمن)` : 'غير معروف'),
          activatorType: subscription.activatedBySeller ? 'بائع' : (subscription.activatedByAdmin ? 'أدمن' : 'غير معروف'),
          subscriptionDate: subscription.startDate,
          planName: subscription.plan?.name || 'غير معروف',
          adminEmail: subscription.activatedByAdmin?.email,
          sellerEmail: subscription.activatedBySeller?.email
        };
      }),
    );

    return result.filter(company => company !== null) as CompanyWithEmployeeCount[];
  }

  async getAllCompaniesWithActivator(): Promise<(CompanyWithEmployeeCount & { activatedById?: string })[]> {
    const subscriptions = await this.subRepo.find({
      relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
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

        return {
          id: sub.company.id,
          name: sub.company.name,
          email: sub.company.email,
          phone: sub.company.phone,
          isActive: sub.company.isActive,
          isVerified: sub.company.isVerified,
          subscriptionStatus: sub.company.subscriptionStatus,
          employeesCount,
          activatedBy: sub.activatedBySeller ? 
            `${sub.activatedBySeller.email} (بائع)` : 
            (sub.activatedByAdmin ? `${sub.activatedByAdmin.email} (أدمن)` : 'غير معروف'),
          activatedById: sub.activatedBySeller?.id || sub.activatedByAdmin?.id,
          activatorType: sub.activatedBySeller ? 'بائع' : (sub.activatedByAdmin ? 'أدمن' : 'غير معروف'),
          subscriptionDate: sub.startDate,
          planName: sub.plan?.name || 'غير معروف',
          adminEmail: sub.activatedByAdmin?.email,
          sellerEmail: sub.activatedBySeller?.email
        };
      })
    );

    return result.filter(company => company !== null) as (CompanyWithEmployeeCount & { activatedById?: string })[];
  }

  async toggleCompany(id: string, isActive: boolean): Promise<Company | null> {
    await this.companyRepo.update(id, { isActive });
    return this.companyRepo.findOne({ where: { id } });
  }

  async updateCompany(id: string, dto: Partial<Company>): Promise<Company | null> {
    const restrictedFields = ['subscriptionStatus', 'planId'];
    restrictedFields.forEach(field => {
      if (dto[field as keyof Company]) {
        throw new ForbiddenException('غير مسموح بتعديل حالة الاشتراك أو الخطة');
      }
    });

    await this.companyRepo.update(id, dto);
    return this.companyRepo.findOne({ where: { id } });
  }

  async deleteCompany(id: string): Promise<void> {
    await this.companyRepo.delete(id);
  }

  async getEmployeesByCompany(companyId: string): Promise<Employee[]> {
    return this.employeeRepo.find({ 
      where: { company: { id: companyId } } 
    });
  }

  async deleteEmployee(id: number): Promise<void> {
    await this.employeeRepo.delete(id);
  }

  async getAllSubscriptions(sellerId?: string): Promise<CompanySubscription[]> {
    if (sellerId) {
      return this.subRepo.find({ 
        where: { activatedBySellerId: sellerId },
        relations: ['company', 'plan'] 
      });
    }
    
    return this.subRepo.find({ 
      relations: ['company', 'plan'] 
    });
  }

  async activateSubscription(id: string): Promise<CompanySubscription | null> {
    await this.subRepo.update(id, { status: SubscriptionStatus.ACTIVE });
    return this.subRepo.findOne({ where: { id } });
  }

  changeSubscriptionPlan(): never {
    throw new ForbiddenException('غير مسموح بتغيير خطط الاشتراكات');
  }

  async subscribeCompanyToPlan(
    companyId: string, 
    planId: string, 
    sellerId: string
  ): Promise<SubscriptionResult> {
    try {
      this.logger.log(`البائع ${sellerId} يشترك بالشركة ${companyId} في الخطة ${planId}`);
      
      const currentSubscription = await this.subscriptionService.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      
      if (currentSubscription && currentSubscription.plan && newPlan) {
        if (newPlan.maxEmployees < currentSubscription.plan.maxEmployees || 
            newPlan.price < currentSubscription.plan.price) {
          throw new BadRequestException(
            `غير مسموح للبائع بتغيير الشركة من خطة ${currentSubscription.plan.name} ` +
            `(${currentSubscription.plan.maxEmployees} موظف - ${currentSubscription.plan.price} ريال) إلى خطة ${newPlan.name} ` +
            `(${newPlan.maxEmployees} موظف - ${newPlan.price} ريال) - غير مسموح بالنزول لخطة أقل`
          );
        }
      }
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        false,  
        sellerId, 
        undefined
      );
      
      this.logger.log(`تم الاشتراك بنجاح للشركة ${companyId} في الخطة ${planId} بواسطة البائع ${sellerId}`);
      
      if (result && typeof result === 'object' && 'message' in result) {
        const seller = await this.sellerRepo.findOne({ where: { id: sellerId } });
        const company = await this.companyRepo.findOne({ where: { id: companyId } });
        const plan = await this.planRepo.findOne({ where: { id: planId } });
        
        if (company && plan && result.subscription && seller) {
          const newEndDateStr = result.subscription.endDate ? 
            result.subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
          const details = `تم تفعيل اشتراك جديد في خطة "${plan.name}" بواسطة البائع. السعر: ${plan.price} ريال. المدة: ${plan.durationInDays || 30} يوم. تاريخ الانتهاء: ${newEndDateStr}.`;
          
          await this.sendSubscriptionActionEmail(
            company.email,
            company.name,
            seller.email,
            plan.name,
            'created',
            details
          );
        }
        
        return {
          message: result.message,
          redirectToDashboard: result.redirectToDashboard,
          redirectToPayment: result.redirectToPayment,
          checkoutUrl: result.checkoutUrl,
          subscription: result.subscription,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الاشتراك');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل اشتراك الشركة ${companyId} في الخطة ${planId}`, errorMessage);
      throw error;
    }
  }

  async cancelSubscription(companyId: string): Promise<CancelSubscriptionResult> {
    try {
      this.logger.log(`البائع يلغي اشتراك الشركة ${companyId}`);
      
      const result = await this.subscriptionService.cancelSubscription(companyId);
      
      if (this.isCancelSubscriptionResult(result)) {
        const subscription = await this.subRepo.findOne({
          where: { company: { id: companyId } },
          relations: ['company', 'plan', 'activatedBySeller'],
          order: { createdAt: 'DESC' }
        });
        
        const seller = subscription?.activatedBySeller;
        if (subscription?.company && subscription?.plan && seller) {
          const details = `تم إلغاء الاشتراك بالخطة "${subscription.plan.name}" بواسطة البائع.`;
          
          await this.sendSubscriptionActionEmail(
            subscription.company.email,
            subscription.company.name,
            seller.email,
            subscription.plan.name,
            'cancelled',
            details
          );
        }
        
        this.logger.log(`تم إلغاء اشتراك الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة الإلغاء');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل إلغاء اشتراك الشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  async extendSubscription(companyId: string): Promise<ExtendSubscriptionResult> {
    try {
      this.logger.log(`البائع يمدد اشتراك الشركة ${companyId}`);
      
      const result = await this.subscriptionService.extendSubscription(companyId);
      
      if (this.isExtendSubscriptionResult(result)) {
        const subscription = result.subscription;
        const seller = subscription?.activatedBySeller;
        
        if (subscription?.company && subscription?.plan && seller) {
          const newEndDateStr = subscription.endDate ? 
            subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
          const details = `تم تمديد الاشتراك بالخطة "${subscription.plan.name}" بواسطة البائع. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
          
          await this.sendSubscriptionActionEmail(
            subscription.company.email,
            subscription.company.name,
            seller.email,
            subscription.plan.name,
            'extended',
            details
          );
        }
        
        this.logger.log(`تم تمديد اشتراك الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة التمديد');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تمديد اشتراك الشركة ${companyId}`, errorMessage);
      throw error;
    }
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

  async changeSubscriptionPlanSeller(companyId: string, newPlanId: string): Promise<SubscriptionResult> {
    try {
      this.logger.log(`البائع يغير خطة الشركة ${companyId} إلى ${newPlanId}`);
      
      const currentSubscription = await this.subscriptionService.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: newPlanId } });
      
      if (currentSubscription && currentSubscription.plan && newPlan) {
        if (newPlan.maxEmployees < currentSubscription.plan.maxEmployees || 
            newPlan.price < currentSubscription.plan.price) {
          throw new BadRequestException(
            `غير مسموح للبائع بتغيير الشركة من خطة ${currentSubscription.plan.name} ` +
            `(${currentSubscription.plan.maxEmployees} موظف - ${currentSubscription.plan.price} ريال) إلى خطة ${newPlan.name} ` +
            `(${newPlan.maxEmployees} موظف - ${newPlan.price} ريال) - غير مسموح بالنزول لخطة أقل`
          );
        }
      }
      
      const result = await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId) as SubscriptionResult;
      
      if (result && typeof result.message === 'string' && result.subscription) {
        const subscription = await this.subRepo.findOne({
          where: { id: result.subscription.id },
          relations: ['company', 'plan', 'activatedBySeller']
        });
        
        if (subscription?.company && subscription?.plan && subscription?.activatedBySeller) {
          const newEndDateStr = subscription.endDate ? 
            subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
          const oldPlanName = currentSubscription?.plan?.name || 'غير معروف';
          const details = `تم تغيير خطة الشركة من "${oldPlanName}" إلى "${subscription.plan.name}" بواسطة البائع. السعر الجديد: ${subscription.plan.price} ريال. تاريخ الانتهاء الجديد: ${newEndDateStr}.`;
          
          await this.sendSubscriptionActionEmail(
            subscription.company.email,
            subscription.company.name,
            subscription.activatedBySeller.email,
            subscription.plan.name,
            'changed',
            details
          );
        }
        
        this.logger.log(`تم تغيير خطة الشركة ${companyId} بنجاح`);
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة تغيير الخطة');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل تغيير خطة الشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  async activateSubscriptionManually(companyId: string, planId: string, sellerId: string): Promise<SubscriptionResult> {
    try {
      this.logger.log(`البائع ${sellerId} يفعل اشتراك الشركة ${companyId} في الخطة ${planId} يدويًا`);
      
      const currentSubscription = await this.subscriptionService.getCompanySubscription(companyId);
      const newPlan = await this.planRepo.findOne({ where: { id: planId } });
      
      if (currentSubscription && currentSubscription.plan && newPlan) {
        if (newPlan.maxEmployees < currentSubscription.plan.maxEmployees || 
            newPlan.price < currentSubscription.plan.price) {
          throw new BadRequestException(
            `غير مسموح للبائع بتغيير الشركة من خطة ${currentSubscription.plan.name} ` +
            `(${currentSubscription.plan.maxEmployees} موظف - ${currentSubscription.plan.price} ريال) إلى خطة ${newPlan.name} ` +
            `(${newPlan.maxEmployees} موظف - ${newPlan.price} ريال) - غير مسموح بالنزول لخطة أقل`
          );
        }
      }
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        false,  
        sellerId, 
        undefined
      );
      
      this.logger.log(`تم التفعيل اليدوي للشركة ${companyId} بنجاح بواسطة البائع ${sellerId}`);
      
      if (result && typeof result === 'object' && 'message' in result) {
        const seller = await this.sellerRepo.findOne({ where: { id: sellerId } });
        const company = await this.companyRepo.findOne({ where: { id: companyId } });
        const plan = await this.planRepo.findOne({ where: { id: planId } });
        
        if (company && plan && result.subscription && seller) {
          const newEndDateStr = result.subscription.endDate ? 
            result.subscription.endDate.toLocaleDateString('ar-SA') : 'غير محدد';
          const details = `تم التفعيل اليدوي للاشتراك في خطة "${plan.name}" بواسطة البائع. السعر: ${plan.price} ريال. المدة: ${plan.durationInDays || 30} يوم. تاريخ الانتهاء: ${newEndDateStr}.`;
          
          await this.sendSubscriptionActionEmail(
            company.email,
            company.name,
            seller.email,
            plan.name,
            'created',
            details
          );
        }
        
        return {
          message: result.message,
          redirectToDashboard: result.redirectToDashboard,
          redirectToPayment: result.redirectToPayment,
          checkoutUrl: result.checkoutUrl,
          subscription: result.subscription,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة التفعيل اليدوي');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل التفعيل اليدوي للشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  async getSubscriptionHistory(companyId: string): Promise<CompanySubscription[]> {
    try {
      this.logger.log(`البائع يجلب سجل اشتراكات الشركة ${companyId}`);
      
      const result = await this.subscriptionService.getSubscriptionHistory(companyId);
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب سجل اشتراكات الشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  async validatePlanChange(companyId: string, newPlanId: string): Promise<PlanChangeValidation> {
    try {
      this.logger.log(`البائع يتحقق من إمكانية تغيير خطة الشركة ${companyId}`);
      
      const result = await this.subscriptionService.validatePlanChange(companyId, newPlanId);
      
      if (this.isPlanChangeValidation(result)) {
        return result;
      }
      
      throw new Error('استجابة غير متوقعة من خدمة التحقق من الخطة');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل التحقق من تغيير خطة الشركة ${companyId}`, errorMessage);
      throw error;
    }
  }

  async getExpiringSubscriptions(days: number, sellerId?: string): Promise<CompanySubscription[]> {
    try {
      this.logger.log(`البائع يجلب الاشتراكات المنتهية خلال ${days} يوم`);
      
      const result = await this.subscriptionService.getExpiringSubscriptions(days);
      
      if (sellerId) {
        return result.filter(sub => sub.activatedBySellerId === sellerId);
      }
      
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الاشتراكات المنتهية`, errorMessage);
      throw error;
    }
  }

  async getManualTransferProofs(): Promise<PaymentProofList[]> {
    try {
      this.logger.log(`البائع يجلب جميع طلبات التحويل البنكي`);
      
      const proofs = await this.paymentProofRepo.find({
        relations: ['company', 'plan'],
        order: { createdAt: 'DESC' },
      });

      return proofs.map((proof) => {
        const companyId = proof.company?.id || 'غير معروف';
        const companyName = proof.company?.name || 'شركة غير معروفة';
        const companyEmail = proof.company?.email || 'بريد غير معروف';
        const planId = proof.plan?.id || 'غير معروف';
        const planName = proof.plan?.name || 'خطة غير معروفة';

        if (!proof.company || !proof.plan) {
          this.logger.warn(`طلب ${proof.id} يفتقد بيانات الشركة أو الخطة`);
        }

        return {
          id: proof.id,
          companyId,
          companyName,
          companyEmail,
          planId,
          planName,
          imageUrl: proof.imageUrl,
          createdAt: proof.createdAt,
          status: proof.status, 
          reviewed: proof.reviewed,
          rejected: proof.rejected,
          decisionNote: proof.decisionNote,
        };
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب طلبات التحويل`, errorMessage);
      throw new InternalServerErrorException('فشل جلب طلبات التحويل');
    }
  }

  async getManualProofDetails(proofId: string): Promise<PaymentProofDetails> {
    try {
      this.logger.log(`البائع يجلب تفاصيل طلب التحويل ${proofId}`);
      
      const proof = await this.paymentProofRepo.findOne({
        where: { id: proofId },
        relations: ['company', 'plan'],
      });

      if (!proof) throw new NotFoundException('الطلب غير موجود');

      if (!proof.company || !proof.plan) {
        this.logger.warn(`طلب ${proofId} يفتقد بيانات الشركة أو الخطة`);
        throw new NotFoundException('بيانات الطلب غير مكتملة');
      }

      return {
        id: proof.id,
        companyId: proof.company.id,
        companyName: proof.company.name,
        companyEmail: proof.company.email,
        planId: proof.plan.id,
        planName: proof.plan.name,
        imageUrl: proof.imageUrl,
        createdAt: proof.createdAt,
        status: proof.status, 
        reviewed: proof.reviewed,
        rejected: proof.rejected,
        decisionNote: proof.decisionNote,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب تفاصيل الطلب ${proofId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب تفاصيل الطلب');
    }
  }

  async approveProof(proofId: string, sellerId?: string): Promise<ApproveRejectResult> {
    try {
      this.logger.log(`البائع ${sellerId} يوافق على طلب التحويل ${proofId}`);
      
      const result = await this.paymentService.approveProof(proofId, sellerId);
      
      this.logger.log(`تم قبول الطلب ${proofId} بنجاح بواسطة البائع ${sellerId}`);
      
      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
        const proof = await this.paymentProofRepo.findOne({
          where: { id: proofId },
          relations: ['company', 'plan'],
        });
        
        const seller = sellerId ? await this.sellerRepo.findOne({ where: { id: sellerId } }) : null;
        
        if (proof?.company && proof?.plan && seller) {
          const details = `تم قبول طلب التحويل البنكي للاشتراك في خطة "${proof.plan.name}". سيتم تفعيل الاشتراك تلقائياً.`;
          
          await this.sendSubscriptionActionEmail(
            proof.company.email,
            proof.company.name,
            seller.email,
            proof.plan.name,
            'created',
            details
          );
        }
        
        return {
          message: result.message,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الموافقة');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل قبول الطلب ${proofId}`, errorMessage);
      throw error;
    }
  }

  async rejectProof(proofId: string, reason: string): Promise<ApproveRejectResult> {
    try {
      this.logger.log(`البائع يرفض طلب التحويل ${proofId}`);
      
      const result = await this.paymentService.rejectProof(proofId, reason);
      
      this.logger.log(`تم رفض الطلب ${proofId} بنجاح`);
      
      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
        const proof = await this.paymentProofRepo.findOne({
          where: { id: proofId },
          relations: ['company', 'plan'],
        });
        
        if (proof?.company && proof?.plan) {
          const details = `تم رفض طلب التحويل البنكي للاشتراك في خطة "${proof.plan.name}". السبب: ${reason}`;
          
          const seller = await this.sellerRepo.findOne({ 
            where: { email: process.env.DEFAULT_SELLER_EMAIL || 'seller@system.local' } 
          });
          
          await this.sendSubscriptionActionEmail(
            proof.company.email,
            proof.company.name,
            seller?.email || 'النظام',
            proof.plan.name,
            'cancelled',
            details
          );
        }
        
        return {
          message: result.message,
        };
      }
      throw new Error('استجابة غير متوقعة من خدمة الرفض');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل رفض الطلب ${proofId}`, errorMessage);
      throw error;
    }
  }

  private getPermissions(role: ManagerRole): Record<string, boolean> {
    return {
      canViewStats: true,
      canManageCompanies: true,
      canManageEmployees: true,
      canManageSubscriptions: true,
      canViewSubscriptions: true,
      canManagePlans: false,
      canChangeSubscriptionPlans: false,
      canManageSellers: false,
    };
  }

  hasPermission(seller: Manager, permission: string): boolean {
    const permissions = this.getPermissions(seller.role);
    return permissions[permission] === true;
  }

  private getRecentActivityItem(companyName: string, action: string, date: Date): { companyName: string; action: string; date: Date } {
    return {
      companyName,
      action,
      date
    };
  }

  async getSellerDetailedStats(sellerId: string): Promise<{
    totalCompanies: number;
    activeCompanies: number;
    expiredCompanies: number;
    pendingCompanies: number;
    cancelledCompanies: number;
    totalEmployees: number;
    totalRevenue: number;
    monthlyRevenue: number;
    companiesByPlan: Array<{ planName: string; count: number }>;
    recentActivity: Array<{ companyName: string; action: string; date: Date }>;
  }> {
    try {
      this.logger.log(`جلب إحصائيات تفصيلية للبائع ${sellerId}`);
      
      const subscriptions = await this.subRepo.find({
        where: { activatedBySellerId: sellerId },
        relations: ['company', 'plan', 'activatedBySeller'],
      });

      const seller = await this.sellerRepo.findOne({ where: { id: sellerId } });
      if (!seller) {
        throw new NotFoundException('البائع غير موجود');
      }

      const totalCompanies = subscriptions.length;
      
      const activeCompanies = subscriptions.filter(
        sub => sub.status === SubscriptionStatus.ACTIVE
      ).length;
      
      const expiredCompanies = subscriptions.filter(
        sub => sub.status === SubscriptionStatus.EXPIRED
      ).length;
      
      const pendingCompanies = subscriptions.filter(
        sub => sub.status === SubscriptionStatus.PENDING
      ).length;
      
      const cancelledCompanies = subscriptions.filter(
        sub => sub.status === SubscriptionStatus.CANCELLED
      ).length;

      let totalEmployees = 0;
      const companyIds = subscriptions
        .filter(sub => sub.company && sub.company.id)
        .map(sub => sub.company.id);
      
      if (companyIds.length > 0) {
        const uniqueCompanyIds = [...new Set(companyIds)];
        totalEmployees = await this.employeeRepo.count({
          where: { company: { id: In(uniqueCompanyIds) } }
        });
      }

      let totalRevenue = 0;
      let monthlyRevenue = 0;
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      for (const sub of subscriptions) {
        if (sub.plan && sub.plan.price) {
          totalRevenue += sub.plan.price;
          
          if (sub.startDate) {
            const subMonth = sub.startDate.getMonth();
            const subYear = sub.startDate.getFullYear();
            
            if (subMonth === currentMonth && subYear === currentYear) {
              monthlyRevenue += sub.plan.price;
            }
          }
        }
      }

      const planMap = new Map<string, number>();
      subscriptions.forEach(sub => {
        const planName = sub.plan?.name || 'غير معروف';
        const count = planMap.get(planName) || 0;
        planMap.set(planName, count + 1);
      });

      const companiesByPlan = Array.from(planMap.entries()).map(([planName, count]) => ({
        planName,
        count
      }));

      const recentActivity: Array<{ companyName: string; action: string; date: Date }> = [];
      for (const sub of subscriptions.slice(0, 10)) {
        if (sub.company) {
          const activityItem = this.getRecentActivityItem(
            sub.company.name,
            this.getSubscriptionAction(sub.status),
            sub.startDate || sub.createdAt
          );
          recentActivity.push(activityItem);
        }
      }

      recentActivity.sort((a, b) => b.date.getTime() - a.date.getTime());

      return {
        totalCompanies,
        activeCompanies,
        expiredCompanies,
        pendingCompanies,
        cancelledCompanies,
        totalEmployees,
        totalRevenue,
        monthlyRevenue,
        companiesByPlan,
        recentActivity
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب إحصائيات البائع ${sellerId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب إحصائيات البائع');
    }
  }

  private getSubscriptionAction(status: SubscriptionStatus): string {
    switch (status) {
      case SubscriptionStatus.ACTIVE:
        return 'تفعيل اشتراك';
      case SubscriptionStatus.PENDING:
        return 'اشتراك معلق';
      case SubscriptionStatus.EXPIRED:
        return 'انتهاء اشتراك';
      case SubscriptionStatus.CANCELLED:
        return 'إلغاء اشتراك';
      default:
        return 'نشاط غير معروف';
    }
  }

  async getSellerCompaniesDetails(sellerId: string): Promise<Array<{
    companyId: string;
    companyName: string;
    companyEmail: string;
    subscriptionStatus: SubscriptionStatus;
    planName: string;
    planPrice: number;
    startDate: Date;
    endDate: Date;
    employeesCount: number;
    isActive: boolean;
    daysRemaining: number;
  }>> {
    try {
      this.logger.log(`جلب تفاصيل شركات البائع ${sellerId}`);
      
      const subscriptions = await this.subRepo.find({
        where: { activatedBySellerId: sellerId },
        relations: ['company', 'plan'],
        order: { startDate: 'DESC' },
      });

      const result = await Promise.all(
        subscriptions.map(async (sub) => {
          if (!sub.company || !sub.plan) {
            return null;
          }

          const employeesCount = await this.employeeRepo.count({
            where: { company: { id: sub.company.id } }
          });

          let daysRemaining = 0;
          if (sub.endDate && sub.status === SubscriptionStatus.ACTIVE) {
            const now = new Date();
            const end = new Date(sub.endDate);
            const diffTime = end.getTime() - now.getTime();
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            daysRemaining = Math.max(0, daysRemaining); 
          }

          return {
            companyId: sub.company.id,
            companyName: sub.company.name,
            companyEmail: sub.company.email,
            subscriptionStatus: sub.status,
            planName: sub.plan.name,
            planPrice: sub.plan.price,
            startDate: sub.startDate,
            endDate: sub.endDate,
            employeesCount,
            isActive: sub.company.isActive && sub.status === SubscriptionStatus.ACTIVE,
            daysRemaining
          };
        })
      );

      return result.filter(item => item !== null) as Array<{
        companyId: string;
        companyName: string;
        companyEmail: string;
        subscriptionStatus: SubscriptionStatus;
        planName: string;
        planPrice: number;
        startDate: Date;
        endDate: Date;
        employeesCount: number;
        isActive: boolean;
        daysRemaining: number;
      }>;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب تفاصيل شركات البائع ${sellerId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب تفاصيل الشركات');
    }
  }

  async getSellerMonthlyStats(sellerId: string, months: number = 12): Promise<Array<{
    month: string;
    year: number;
    newCompanies: number;
    totalRevenue: number;
    activeSubscriptions: number;
  }>> {
    try {
      this.logger.log(`جلب الإحصائيات الشهرية للبائع ${sellerId} لآخر ${months} شهر`);
      
      const subscriptions = await this.subRepo.find({
        where: { activatedBySellerId: sellerId },
        relations: ['plan'],
      });

      const monthlyStats: Map<string, {
        month: string;
        year: number;
        newCompanies: number;
        totalRevenue: number;
        activeSubscriptions: number;
      }> = new Map();

      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];

      for (let i = 0; i < months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.getMonth();
        const year = date.getFullYear();
        const key = `${year}-${month}`;
        
        monthlyStats.set(key, {
          month: monthNames[month],
          year,
          newCompanies: 0,
          totalRevenue: 0,
          activeSubscriptions: 0,
        });
      }

      subscriptions.forEach(sub => {
        if (sub.startDate) {
          const subMonth = sub.startDate.getMonth();
          const subYear = sub.startDate.getFullYear();
          const key = `${subYear}-${subMonth}`;
          
          if (monthlyStats.has(key)) {
            const stats = monthlyStats.get(key)!;
            stats.newCompanies++;
            
            if (sub.plan?.price) {
              stats.totalRevenue += sub.plan.price;
            }
            
            if (sub.status === SubscriptionStatus.ACTIVE) {
              stats.activeSubscriptions++;
            }
          }
        }
      });

      const resultArray = Array.from(monthlyStats.values())
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return monthNames.indexOf(b.month) - monthNames.indexOf(a.month);
        });

      return resultArray;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`فشل جلب الإحصائيات الشهرية للبائع ${sellerId}`, errorMessage);
      throw new InternalServerErrorException('فشل جلب الإحصائيات الشهرية');
    }
  }
}