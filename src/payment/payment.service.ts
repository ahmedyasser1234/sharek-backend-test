import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StripeGateway } from './gateways/stripe.gateway';
import { HyperPayGateway } from './gateways/hyperpay.gateway';
import { PayTabsGateway } from './gateways/paytabs.geteway';
import { TapGateway } from './gateways/tap.gateway';
import { STCPayGateway } from './gateways/stcpay.gateway';
import { GeideaGateway } from './gateways/geidea.gateway';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { Plan } from '../plan/entities/plan.entity';
import {
  CompanySubscription,
  SubscriptionStatus,
} from '../subscription/entities/company-subscription.entity';
import { PaymentProvider } from './payment-provider.enum';
import { PaymentProof } from './entities/payment-proof.entity';
import { CloudinaryService } from '../common/services/cloudinary.service';
import * as nodemailer from 'nodemailer';
import sharp from 'sharp';
import { PaymentProofStatus } from './entities/payment-proof-status.enum';
import { NotificationService } from '../notification/notification.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { Manager } from '../admin/entities/manager.entity';  
import { Admin } from '../admin/entities/admin.entity';  
import { Supadmin } from '../admin/entities/supadmin.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  
  private readonly actionColors = {
    'payment_request': '#007bff',        
    'payment_success': '#28a745',       
    'proof_received': '#17a2b8',         
    'proof_pending': '#ffc107',          
    'proof_approved': '#28a745',        
    'proof_rejected': '#dc3545',    
    'subscription_activated': '#20c997', 
    'subscription_cancelled': '#6f42c1'  
  };

  constructor(
    private readonly stripe: StripeGateway,
    private readonly hyperpay: HyperPayGateway,
    private readonly paytabs: PayTabsGateway,
    private readonly tap: TapGateway,
    private readonly geidea: GeideaGateway,
    private readonly stcpay: STCPayGateway,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompanySubscription)
    private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Admin)  
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(Manager)  
    private readonly sellerRepo: Repository<Manager>,
    @InjectRepository(Supadmin) 
    private readonly supadminRepo: Repository<Supadmin>,
    @InjectRepository(PaymentProof)
    private readonly paymentProofRepo: Repository<PaymentProof>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => SubscriptionService))
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async generateCheckoutUrl(
    provider: PaymentProvider,
    plan: Plan,
    companyId: string,
  ): Promise<string> {
    try {
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (!company) throw new HttpException(`الشركة غير موجودة: ${companyId}`, HttpStatus.NOT_FOUND);

      let checkoutUrl: string;
      let externalId: string = `${companyId}-${Date.now()}`;

      switch (provider) {
        case PaymentProvider.STRIPE:
          externalId = plan.stripePriceId ?? '';
          checkoutUrl = await this.stripe.generateCheckoutUrl(externalId, companyId);
          break;
        case PaymentProvider.HYPERPAY:
          checkoutUrl = await this.hyperpay.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.PAYTABS:
          checkoutUrl = await this.paytabs.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.TAP:
          checkoutUrl = await this.tap.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.GEIDEA:
          checkoutUrl = await this.geidea.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.STCPAY:
          checkoutUrl = this.stcpay.generateCheckoutUrl(plan.id, companyId);
          break;
        case PaymentProvider.MANUAL_TRANSFER:
          checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/manual-payment?companyId=${companyId}&planId=${plan.id}`;
          break;
        default:
          throw new HttpException(`بوابة الدفع غير مدعومة: ${String(provider)}`, HttpStatus.BAD_REQUEST);
      }

      const transaction = this.transactionRepo.create({
        company,
        plan,
        amount: Number(plan.price),
        currency: plan.currency || 'SAR',
        provider,
        status: 'pending',
        externalTransactionId: externalId,
      });

      await this.transactionRepo.save(transaction);
      
      await this.sendPaymentRequestEmail(company, plan, provider);
      
      return checkoutUrl;
    } catch (err) {
      this.logger.error(`فشل إنشاء رابط الدفع: ${String(err)}`);
      throw new HttpException('فشل إنشاء رابط الدفع', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async confirmTransaction(externalTransactionId: string): Promise<void> {
    try {
      const transaction = await this.transactionRepo.findOne({
        where: { externalTransactionId },
        relations: ['company', 'plan'],
      });

      if (!transaction || transaction.status === 'success') return;
      if (!transaction.plan) throw new HttpException('الخطة غير موجودة في المعاملة', HttpStatus.NOT_FOUND);

      transaction.status = 'success';
      await this.transactionRepo.save(transaction);

      const subscription = this.subRepo.create({
        company: transaction.company,
        plan: transaction.plan,
        startDate: new Date(),
        endDate: new Date(Date.now() + transaction.plan.durationInDays * 86400000),
        price: transaction.amount,
        currency: transaction.currency,
        status: SubscriptionStatus.ACTIVE,
        paymentTransaction: transaction,
      });

      await this.subRepo.save(subscription);

      await this.sendPaymentSuccessEmail(
        transaction.company.email,
        transaction.company.name,
        transaction.plan.name,
        transaction.amount,
        transaction.currency
      );

      await this.notificationService.notifyPaymentSuccess(
        {
          name: transaction.company.name,
          email: transaction.company.email,
          id: transaction.company.id
        },
        {
          name: transaction.plan.name
        }
      );

      await this.notificationService.notifyCompanySubscriptionApproved({
        id: transaction.id,
        company: {
          id: transaction.company.id,
          name: transaction.company.name,
          email: transaction.company.email
        },
        plan: {
          name: transaction.plan.name
        }
      });

      await this.sendDecisionEmail(
        transaction.company.email,
        transaction.company.name,
        transaction.plan.name,
        true,
        'تم الدفع بنجاح من خلال بوابة الدفع الإلكترونية'
      );
    } catch (err) {
      this.logger.error(`فشل تأكيد المعاملة: ${String(err)}`);
      throw new HttpException('فشل تأكيد المعاملة', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async handleManualTransferProof(
    dto: { companyId: string; planId: string },
    file: Express.Multer.File
  ): Promise<{ message: string }> {
    const existingPendingProof = await this.paymentProofRepo.findOne({
      where: { 
        company: { id: dto.companyId },
        status: PaymentProofStatus.PENDING 
      },
      relations: ['company', 'plan'],
    });

    if (existingPendingProof) {
      throw new HttpException(
        'لا يمكن ارسال الوصل لان هناك وصل اخر قيد المراجعه من قبل الاداره',
        HttpStatus.BAD_REQUEST
      );
    }

    const [company, plan] = await Promise.all([
      this.companyRepo.findOne({
        where: { id: dto.companyId },
        select: ['id', 'name', 'email', 'phone'],
      }),
      this.planRepo.findOneBy({ id: dto.planId }),
    ]);

    if (!company) throw new HttpException('الشركة غير موجودة', HttpStatus.NOT_FOUND);
    if (!plan) throw new HttpException('الخطة غير موجودة', HttpStatus.NOT_FOUND);

    let imageUrl: string;
    let publicId: string;

    try {
      const compressedBuffer = await sharp(file.buffer)
        .resize({ width: 1000 }) 
        .jpeg({ quality: 70 })  
        .toBuffer();

      const result = await this.cloudinaryService.uploadImage(
        { ...file, buffer: compressedBuffer },
        'payment_proofs'
      );

      imageUrl = result.secure_url;
      publicId = result.public_id;
    } catch (error) {
      this.logger.error(`فشل رفع الصورة: ${String(error)}`);
      throw new HttpException('فشل رفع الصورة', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const proof = this.paymentProofRepo.create({
      company,
      plan,
      imageUrl,
      publicId,
      status: PaymentProofStatus.PENDING,
    });

    await this.paymentProofRepo.save(proof);

    await this.sendProofReceivedEmail(
      company.email,
      company.name,
      plan.name,
      imageUrl
    );

    await this.sendProofNotificationToAdmin(company, plan, imageUrl);

    await this.notificationService.notifyNewSubscriptionRequest({
      id: proof.id,
      company: {
        id: company.id,
        name: company.name,
        email: company.email
      },
      plan: {
        name: plan.name
      },
      imageUrl: imageUrl,
      createdAt: proof.createdAt
    });

    return { message: 'تم إرسال وصل التحويل، سيتم مراجعته من قبل الإدارة' };
  }

  async hasPendingSubscription(companyId: string): Promise<boolean> {
    const pendingProof = await this.paymentProofRepo.findOne({
      where: { 
        company: { id: companyId },
        status: PaymentProofStatus.PENDING 
      },
    });
  
    return !!pendingProof;
  }

async approveProof(
  proofId: string, 
  approvedById?: string,  
  supadminId?: string    
): Promise<{ message: string }> {
  const proof = await this.paymentProofRepo.findOne({
    where: { id: proofId },
    relations: ['company', 'plan'],
  });

  if (!proof) {
    this.logger.error(`طلب غير موجود: ${proofId}`);
    throw new NotFoundException('الطلب غير موجود');
  }

  let adminEmail: string | undefined;
  let sellerEmail: string | undefined;
  let supadminEmail: string | undefined;
  let userType: 'admin' | 'seller' | 'supadmin' | 'unknown' = 'unknown';
  let activatorId: string | undefined;
  
  // ✅ تحديد نوع المستخدم
  if (supadminId) {
    // إذا كان supadmin
    userType = 'supadmin';
    activatorId = supadminId;
    try {
      const supadmin = await this.supadminRepo.findOne({ 
        where: { id: supadminId },
        select: ['email']
      });
      supadminEmail = supadmin?.email || process.env.SUPADMIN_EMAIL || 'supadmin@system.local';
    } catch (error) {
      this.logger.warn(`لم يتم العثور على المسؤول الأعلى ${supadminId}: ${error}`);
      supadminEmail = process.env.SUPADMIN_EMAIL || 'supadmin@system.local';
    }
  } else if (approvedById) {
    // تحقق إذا كان أدمن أم بائع
    try {
      // أولاً: تحقق إذا كان أدمن
      const admin = await this.adminRepo.findOne({ 
        where: { id: approvedById },
        select: ['email']
      });
      
      if (admin) {
        userType = 'admin';
        activatorId = approvedById;
        adminEmail = admin.email || process.env.ADMIN_EMAIL || 'admin@system.local';
      } else {
        // ثانياً: تحقق إذا كان بائع
        const seller = await this.sellerRepo.findOne({ 
          where: { id: approvedById },
          select: ['email']
        });
        
        if (seller) {
          userType = 'seller';
          activatorId = approvedById;
          sellerEmail = seller.email || process.env.SELLER_EMAIL || 'seller@system.local';
        } else {
          // ثالثاً: تحقق إذا كان supadmin (لكن بدون supadminId)
          const supadmin = await this.supadminRepo.findOne({ 
            where: { id: approvedById },
            select: ['email']
          });
          
          if (supadmin) {
            userType = 'supadmin';
            activatorId = approvedById;
            supadminEmail = supadmin.email || process.env.SUPADMIN_EMAIL || 'supadmin@system.local';
          } else {
            // إذا لم نجد أي نوع
            userType = 'unknown';
            this.logger.warn(`المستخدم ${approvedById} غير موجود كأدمن، بائع، أو مسؤول أعلى`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`فشل التحقق من المستخدم ${approvedById}: ${error}`);
      userType = 'unknown';
    }
  }

  // ✅ تحديد المعلمات بناءً على نوع المستخدم
  let activatedBySellerId: string | undefined;
  let activatedByAdminId: string | undefined;
  let activatedBySupadminId: string | undefined;
  let activatorEmail: string | undefined;

  switch (userType) {
    case 'admin':
      activatedByAdminId = activatorId;
      activatorEmail = adminEmail || process.env.ADMIN_EMAIL || 'admin@system.local';
      break;
    case 'seller':
      activatedBySellerId = activatorId;
      activatorEmail = sellerEmail || process.env.SELLER_EMAIL || 'seller@system.local';
      break;
    case 'supadmin':
      activatedBySupadminId = activatorId;
      activatorEmail = supadminEmail || process.env.SUPADMIN_EMAIL || 'supadmin@system.local';
      break;
    default:
      activatorEmail = process.env.SYSTEM_EMAIL || 'system@system.local';
  }

  this.logger.log(`تفاصيل الموافقة على الطلب ${proofId}:`);
  this.logger.log(`- userType: ${userType}`);
  this.logger.log(`- activatedBySellerId: ${activatedBySellerId}`);
  this.logger.log(`- activatedByAdminId: ${activatedByAdminId}`);
  this.logger.log(`- activatedBySupadminId: ${activatedBySupadminId}`);
  this.logger.log(`- activatorEmail: ${activatorEmail}`);

  const result = await this.subscriptionService.subscribe(
    proof.company.id,       
    proof.plan.id,          
    true,                   
    activatedBySellerId,     
    activatedByAdminId,     
    activatedBySupadminId,  
    activatorEmail          
  );

  proof.status = PaymentProofStatus.APPROVED;
  proof.reviewed = true;
  proof.rejected = false;
  
  switch (userType) {
    case 'admin':
      proof.decisionNote = `تم القبول بواسطة الأدمن ${adminEmail || activatorId}`;
      break;
    case 'seller':
      proof.decisionNote = `تم القبول بواسطة البائع ${sellerEmail || activatorId}`;
      break;
    case 'supadmin':
      proof.decisionNote = `تم القبول بواسطة المسؤول الأعلى ${supadminEmail || activatorId}`;
      break;
    default:
      proof.decisionNote = 'تم القبول بواسطة النظام';
  }
  
  if (activatorId) {
    proof.approvedById = activatorId;
  }
  
  await this.paymentProofRepo.save(proof);

  await this.sendDecisionEmail(
    proof.company.email,
    proof.company.name,
    proof.plan.name,
    true,
    userType === 'supadmin' ? `بواسطة المسؤول الأعلى: ${supadminEmail || activatorId}` :
    (userType === 'admin' ? `بواسطة الأدمن: ${adminEmail || activatorId}` :
    (userType === 'seller' ? `بواسطة البائع: ${sellerEmail || activatorId}` : 'بواسطة النظام'))
  );

  await this.notificationService.notifyCompanySubscriptionApproved({
    id: proof.id,
    company: {
      id: proof.company.id,
      name: proof.company.name,
      email: proof.company.email
    },
    plan: {
      name: proof.plan.name
    },
    imageUrl: proof.imageUrl,
    createdAt: proof.createdAt
  });

  return { 
    message: result.message || 'تم قبول الطلب وتفعيل الاشتراك بنجاح' 
  };
}

  async rejectProof(proofId: string, reason: string): Promise<{ message: string }> {
    const proof = await this.paymentProofRepo.findOne({
      where: { id: proofId },
      relations: ['company', 'plan'],
    });

    if (!proof) {
      this.logger.error(`طلب غير موجود: ${proofId}`);
      throw new NotFoundException('الطلب غير موجود');
    }

    proof.status = PaymentProofStatus.REJECTED;
    proof.rejected = true;
    proof.reviewed = true;
    proof.decisionNote = reason;
    await this.paymentProofRepo.save(proof);

    await this.sendDecisionEmail(
      proof.company.email,
      proof.company.name,
      proof.plan.name,
      false,
      reason
    );

    await this.notificationService.notifyCompanySubscriptionRejected({
      id: proof.id,
      company: {
        id: proof.company.id,
        name: proof.company.name,
        email: proof.company.email
      },
      plan: {
        name: proof.plan.name
      },
      decisionNote: reason,
      imageUrl: proof.imageUrl,
      createdAt: proof.createdAt
    });

    return { message: 'تم رفض الطلب وإرسال إشعار للشركة' };
  }


  private async sendPaymentRequestEmail(
    company: Company,
    plan: Plan,
    provider: PaymentProvider
  ): Promise<void> {
    try {
      const providerText = this.getPaymentProviderText(provider);
      const subject = `طلب دفع جديد - ${company.name}`;
      
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
              background-color: ${this.actionColors['payment_request']};
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
              border-right: 4px solid ${this.actionColors['payment_request']};
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
            .action-box {
              background-color: #f0f7ff;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .action-box h3 {
              color: ${this.actionColors['payment_request']};
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
            .company-info {
              background-color: #e8f5e9;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
              text-align: center;
            }
            .company-info h3 {
              color: #2e7d32;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>طلب دفع جديد</h1>
              <p>منصة شارك - نظام الدفع الآمن</p>
            </div>
            
            <div class="content">
              <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

              <div class="info-box">
                <p><strong>الشركة:</strong> ${company.name}</p>
                <p><strong>البريد الإلكتروني:</strong> ${company.email}</p>
                <p><strong>الخطة:</strong> ${plan.name}</p>
                <p><strong>السعر:</strong> ${plan.price} ${plan.currency}</p>
                <p><strong>بوابة الدفع:</strong> ${providerText}</p>
                <p><strong>تاريخ الطلب:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
              </div>
              
              <div class="action-box">
                <h3>تفاصيل طلب الدفع:</h3>
                <p>تم إنشاء طلب دفع جديد للاشتراك في الخطة "${plan.name}" عبر بوابة ${providerText}.</p>
                <p>سيتم تفعيل الاشتراك تلقائياً بعد اكتمال عملية الدفع.</p>
              </div>
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                     alt="منصة شارك" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0;">
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(company.email, subject, html);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل طلب الدفع: ${String(error)}`);
    }
  }

  private async sendPaymentSuccessEmail(
    email: string,
    companyName: string,
    planName: string,
    amount: number,
    currency: string
  ): Promise<void> {
    try {
      const subject = `تم تأكيد عملية الدفع - ${companyName}`;
      
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
              background-color: ${this.actionColors['payment_success']};
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
              border-right: 4px solid ${this.actionColors['payment_success']};
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
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: center;
            }
            .success-box h3 {
              color: #155724;
              margin-bottom: 10px;
            }
            .benefits-box {
              background-color: #e8f5e9;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .benefits-box h3 {
              color: #2e7d32;
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>تم تأكيد عملية الدفع</h1>
              <p>منصة شارك - إشعار نجاح الدفع</p>
            </div>
            
            <div class="content">
              <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

              <div class="success-box">
                <h3>تم تأكيد عملية الدفع بنجاح</h3>
                <p style="font-size: 18px; margin-bottom: 10px;">شكراً لك على دفعتك الآمنة</p>
              </div>
              
              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>المبلغ المدفوع:</strong> ${amount} ${currency}</p>
                <p><strong>رقم المرجع:</strong> PAY-${Date.now().toString().slice(-8)}</p>
                <p><strong>تاريخ الدفع:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>وقت الدفع:</strong> ${new Date().toLocaleTimeString('ar-SA')}</p>
              </div>
              
              <div class="benefits-box">
                <h3> مميزات اشتراكك الجديد:</h3>
                <ul>
                  <li>وصول كامل لجميع مميزات الخطة ${planName}</li>
                  <li>دعم فني على مدار الساعة</li>
                  <li>تجربة مستخدم محسنة</li>
                  <li>تحديثات دورية للمنصة</li>
                </ul>
              </div>
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                     alt="منصة شارك" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0;">
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(email, subject, html);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل نجاح الدفع: ${String(error)}`);
    }
  }

  private async sendProofReceivedEmail(
    email: string,
    companyName: string,
    planName: string,
    proofImageUrl: string
  ): Promise<void> {
    try {
      const subject = `تم استلام وصل التحويل - ${companyName}`;
      
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
              background-color: ${this.actionColors['proof_received']};
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
              border-right: 4px solid ${this.actionColors['proof_received']};
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
              background-color: #fff3cd;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .notice-box h3 {
              color: #856404;
              margin-bottom: 10px;
            }
            .timeline {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .timeline h3 {
              color: #6c757d;
              margin-bottom: 15px;
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
              background-color: #e8f5e9;
              padding: 20px;
              border-radius: 8px;
              margin-top: 20px;
              text-align: center;
            }
            .company-info h3 {
              color: #2e7d32;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>تم استلام وصل التحويل</h1>
              <p>منصة شارك - إشعار استلام الوصل</p>
            </div>
            
            <div class="content">
              <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>تاريخ الإرسال:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>وقت الإرسال:</strong> ${new Date().toLocaleTimeString('ar-SA')}</p>
              </div>
              
              <div class="notice-box">
                <h3> حالة طلبك:</h3>
                <div style="background-color: #fff3cd; border-right: 4px solid #ffc107; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p><strong> تم استلام وصل التحويل بنجاح</strong></p>
                  <p>طلبك الآن قيد المراجعة من قبل إدارة منصة شارك.</p>
                </div>
              </div>
              
              <div style="text-align: center; margin: 20px 0;">
                <a href="${proofImageUrl}" target="_blank" style="display: inline-block;">
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; border: 2px dashed #dee2e6;">
                    <p style="color: #6c757d; margin-bottom: 10px;">📎 اضغط لعرض صورة الوصل</p>
                    <p style="font-size: 12px; color: #adb5bd;">(يتم فتح الصورة في نافذة جديدة)</p>
                  </div>
                </a>
              </div>
              
              <div class="timeline">
                <h3> المدة المتوقعة للمراجعة:</h3>
                <div style="display: flex; justify-content: space-between; margin: 20px 0; position: relative;">
                  <div style="text-align: center; position: relative; z-index: 2;">
                    <div style="width: 40px; height: 40px; background-color: #007bff; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                      1
                    </div>
                    <p style="font-size: 12px;">استلام الوصل</p>
                  </div>
                  <div style="text-align: center; position: relative; z-index: 2;">
                    <div style="width: 40px; height: 40px; background-color: #ffc107; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                      2
                    </div>
                    <p style="font-size: 12px;">مراجعة الإدارة</p>
                  </div>
                  <div style="text-align: center; position: relative; z-index: 2;">
                    <div style="width: 40px; height: 40px; background-color: #28a745; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                      3
                    </div>
                    <p style="font-size: 12px;">تفعيل الاشتراك</p>
                  </div>
                  <div style="position: absolute; top: 20px; left: 10%; right: 10%; height: 2px; background-color: #dee2e6; z-index: 1;"></div>
                </div>
              </div>
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                     alt="منصة شارك" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0;">
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(email, subject, html);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل استلام الوصل: ${String(error)}`);
    }
  }

  private async sendProofNotificationToAdmin(
    company: Company,
    plan: Plan,
    proofImageUrl: string
  ): Promise<void> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
      if (!adminEmail) {
        this.logger.warn('لم يتم تعيين بريد الأدمن للإشعارات');
        return;
      }

      const subject = ` وصل تحويل جديد للمراجعة - ${company.name}`;
      
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
              background-color: ${this.actionColors['proof_pending']};
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
              border-right: 4px solid ${this.actionColors['proof_pending']};
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
            .alert-box {
              background-color: #f8d7da;
              color: #721c24;
              padding: 15px;
              border-radius: 5px;
              border: 1px solid #f5c6cb;
              margin-bottom: 20px;
            }
            .alert-box h3 {
              color: #721c24;
              margin: 0;
            }
            .action-buttons {
              text-align: center;
              margin: 30px 0;
            }
            .quick-info {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .quick-info h3 {
              color: #6c757d;
              margin-bottom: 15px;
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
              <h1>وصل تحويل جديد للمراجعة</h1>
              <p>منصة شارك - نظام إدارة المدفوعات</p>
            </div>
            
            <div class="content">
              <div class="alert-box">
                <h3>يتطلب المراجعة الفورية</h3>
                <p style="margin: 10px 0 0;">يوجد وصل تحويل جديد بانتظار مراجعتك</p>
              </div>
              
              <div class="info-box">
                <p><strong> كود الشركة:</strong> ${company.id}</p>
                <p><strong> اسم الشركة:</strong> ${company.name}</p>
                <p><strong> البريد الإلكتروني:</strong> ${company.email}</p>
                <p><strong> الهاتف:</strong> ${company.phone || 'غير متوفر'}</p>
                <p><strong> الخطة المطلوبة:</strong> ${plan.name}</p>
                <p><strong> سعر الخطة:</strong> ${plan.price} ${plan.currency}</p>
                <p><strong> تاريخ الطلب:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong> وقت الطلب:</strong> ${new Date().toLocaleTimeString('ar-SA')}</p>
              </div>
              
              <div>
                <h3> وصل التحويل:</h3>
                <div style="text-align: center; margin: 20px 0;">
                  <a href="${proofImageUrl}" target="_blank">
                    <img src="${proofImageUrl}" 
                         style="max-width: 100%; height: auto; border-radius: 10px; border: 2px solid #dee2e6; box-shadow: 0 2px 10px rgba(0,0,0,0.1);"
                         alt="وصل التحويل">
                  </a>
                  <p style="margin-top: 10px; font-size: 12px; color: #6c757d;">
                    <a href="${proofImageUrl}" target="_blank" style="color: #007bff;">🔗 رابط الصورة المباشر</a>
                  </p>
                </div>
              </div>
              
              <div class="action-buttons">
                <p><strong> اتخاذ الإجراء المناسب:</strong></p>
                <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-top: 15px;">
                  <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000/admin'}/payment-proofs" 
                     style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      الموافقة على الوصل
                  </a>
                  <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000/admin'}/payment-proofs/reject" 
                     style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                      رفض الوصل
                  </a>
                </div>
              </div>
              
              <div class="quick-info">
                <h3> معلومات سريعة:</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0;">
                  <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px;">
                    <p style="margin: 0; font-weight: bold; color: #2e7d32;">المدة المتوقعة</p>
                    <p style="margin: 5px 0 0; font-size: 14px;">24-48 ساعة للمراجعة</p>
                  </div>
                  <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px;">
                    <p style="margin: 0; font-weight: bold; color: #856404;">أولوية المراجعة</p>
                    <p style="margin: 5px 0 0; font-size: 14px;">متوسطة</p>
                  </div>
                </div>
              </div>
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                     alt="منصة شارك" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0;">
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(adminEmail, subject, html);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل إشعار الأدمن: ${String(error)}`);
    }
  }

  private async sendDecisionEmail(
    email: string,
    companyName: string,
    planName: string,
    accepted: boolean,
    reason?: string,
  ): Promise<void> {
    try {
      if (!email) return;

      const subject = accepted
        ? ` تم قبول طلب الاشتراك في "${planName}"`
        : `تم رفض طلب الاشتراك في "${planName}"`;

      const headerColor = accepted ? this.actionColors['proof_approved'] : this.actionColors['proof_rejected'];
      const icon = accepted ? '✅' : '❌';
      const statusText = accepted ? 'مقبول' : 'مرفوض';
      const statusColor = accepted ? '#155724' : '#721c24';
      const statusBg = accepted ? '#d4edda' : '#f8d7da';

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
              background-color: ${headerColor};
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
              border-right: 4px solid ${headerColor};
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
            .status-box {
              background-color: ${statusBg};
              color: ${statusColor};
              padding: 25px;
              border-radius: 10px;
              border: 1px solid ${accepted ? '#c3e6cb' : '#f5c6cb'};
              text-align: center;
              margin: 20px 0;
            }
            .details-box {
              background-color: #fff3cd;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .details-box h3 {
              color: #856404;
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${accepted ? 'قبول طلب الاشتراك' : 'رفض طلب الاشتراك'}</h1>
              <p>منصة شارك - إشعار القرار</p>
            </div>
            
            <div class="content">
              <div class="company-info">
                <h3>مرحبا بكم في منصة شارك</h3>
                <p>أول منصة سعودية لإنشاء بروفايل رقمي للموظفين والشركات</p>
                <p>نحن نسعى دائماً لتقديم أفضل الخدمات لدعم عملك ونمو شركتك</p>
              </div>

              <div class="status-box">
                <div style="font-size: 48px; margin-bottom: 15px;">${icon}</div>
                <h2 style="color: ${statusColor}; margin-bottom: 10px;">${accepted ? 'تهانينا! تم قبول طلبك' : 'نأسف! تم رفض طلبك'}</h2>
                <p style="font-size: 18px; margin: 0;">حالة الطلب: <strong>${statusText}</strong></p>
              </div>
              
              <div class="info-box">
                <p><strong>الشركة:</strong> ${companyName}</p>
                <p><strong>الخطة:</strong> ${planName}</p>
                <p><strong>تاريخ القرار:</strong> ${new Date().toLocaleDateString('ar-SA')}</p>
                <p><strong>وقت القرار:</strong> ${new Date().toLocaleTimeString('ar-SA')}</p>
              </div>
              
              ${!accepted ? `
              <div class="details-box">
                <h3> تفاصيل الرفض:</h3>
                <p>${reason || 'لم يتم تحديد سبب محدد للرفض.'}</p>
              </div>
              ` : ''}
              
              <div>
                <p>تحت مع تحيات فريق شارك</p>
                <p>https://sharik-sa.com/</p>
                <img src="https://res.cloudinary.com/dk3wwuy5d/image/upload/v1765288029/subscription-banner_skltmg.jpg" 
                     alt="منصة شارك" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0;">
                <p>نحن هنا لدعمك ومساعدتك في أي وقت</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(email, subject, html);
    } catch (error) {
      this.logger.error(`فشل إرسال إيميل القرار: ${String(error)}`);
    }
  }


  private getPaymentProviderText(provider: PaymentProvider): string {
    const providers = {
      [PaymentProvider.STRIPE]: 'سترايب',
      [PaymentProvider.HYPERPAY]: 'هايبر باي',
      [PaymentProvider.PAYTABS]: 'باي تابس',
      [PaymentProvider.TAP]: 'تاب',
      [PaymentProvider.GEIDEA]: 'جيديا',
      [PaymentProvider.STCPAY]: 'STC باي',
      [PaymentProvider.MANUAL_TRANSFER]: 'تحويل بنكي يدوي'
    };
    return providers[provider] || 'غير معروف';
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      const emailHost = process.env.EMAIL_HOST;
      const emailPort = process.env.EMAIL_PORT;
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;

      if (!emailHost || !emailPort || !emailUser || !emailPass) {
        this.logger.warn('إعدادات البريد الإلكتروني غير مكتملة');
        return;
      }

      const transporter = nodemailer.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: false,
        auth: {
          user: emailUser,
          pass: emailPass,
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false,
        },
      });

      await transporter.sendMail({
        from: emailUser,
        to,
        subject,
        html,
      });
      
      this.logger.log(`تم إرسال الإيميل بنجاح إلى: ${to}`);
    } catch (error) {
      this.logger.error(`فشل إرسال الإيميل: ${String(error)}`);
      // لا نلقي خطأ حتى لا نوقف عملية الدفع الرئيسية
    }
  }
}