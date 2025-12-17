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

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

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
          checkoutUrl = `http://localhost:3000/manual-payment?companyId=${companyId}&planId=${plan.id}`;
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

      try {
        await this.sendDecisionEmail(
          transaction.company.email,
          transaction.company.name,
          transaction.plan.name,
          true
        );
      } catch (err) {
        this.logger.error(`فشل إرسال إيميل التفعيل: ${String(err)}`);
      }
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
        select: ['id', 'name', 'email'],
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

    try {
      await this.sendProofNotification(company, plan, imageUrl);
    } catch (err) {
      this.logger.error(`فشل إرسال إشعار الإدارة: ${String(err)}`);
    }

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

async approveProof(proofId: string, approvedById?: string): Promise<{ message: string }> {
  const proof = await this.paymentProofRepo.findOne({
    where: { id: proofId },
    relations: ['company', 'plan'],
  });

  if (!proof) {
    this.logger.error(`طلب غير موجود: ${proofId}`);
    throw new NotFoundException('الطلب غير موجود');
  }

  let adminEmail: string | undefined;
  if (approvedById) {
    adminEmail = process.env.ADMIN_EMAIL || 'admin@system.local';
  }

  const result = await this.subscriptionService.subscribe(
    proof.company.id,       
    proof.plan.id,          
    true,                   
    undefined,              
    approvedById,           
    undefined,              
    adminEmail              
  );

  proof.status = PaymentProofStatus.APPROVED;
  proof.reviewed = true;
  proof.rejected = false;
  proof.decisionNote = approvedById ? 'تم القبول بواسطة الأدمن' : 'تم القبول بواسطة النظام';
  
  if (approvedById) {
    proof.approvedById = approvedById;
  }
  
  await this.paymentProofRepo.save(proof);

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

  if (proof.company.email) {
    try {
      await this.sendDecisionEmail(
        proof.company.email,
        proof.company.name,
        proof.plan.name,
        true,
        approvedById ? `بواسطة الأدمن: ${adminEmail || approvedById}` : 'بواسطة النظام'
      );
    } catch (err) {
      this.logger.error(`فشل إرسال إشعار القبول: ${String(err)}`);
    }
  }

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

    if (proof.company.email) {
      try {
        await this.sendDecisionEmail(
          proof.company.email,
          proof.company.name,
          proof.plan.name,
          false,
          reason
        );
      } catch (err) {
        this.logger.error(`فشل إرسال إشعار الرفض: ${String(err)}`);
      }
    }

    return { message: 'تم رفض الطلب وإرسال إشعار للشركة' };
  }

  async sendProofNotification(company: Company, plan: Plan, imageUrl: string): Promise<void> {
    if (!company.email) {
      throw new HttpException('لا يوجد إيميل للشركة', HttpStatus.BAD_REQUEST);
    }

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailHost || !emailPort || !emailUser || !emailPass) {
      throw new HttpException('إعدادات البريد الإلكتروني غير مكتملة', HttpStatus.INTERNAL_SERVER_ERROR);
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

    const subject = `وصل تحويل جديد من ${company.name}`;
    const html = `
      <h3>شركة: ${company.name}</h3>
      <p>الإيميل: ${company.email}</p>
      <p>الخطة المطلوبة: ${plan.name}</p>
      <p>رابط الوصل: <a href="${imageUrl}" target="_blank">عرض الصورة</a></p>
    `;

    await transporter.sendMail({
      from: emailUser,
      to: emailUser,
      subject,
      html,
    });
  }

  async sendDecisionEmail(
    email: string,
    companyName: string,
    planName: string,
    accepted: boolean,
    reason?: string,
  ): Promise<void> {
    if (!email) return;

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailHost || !emailPort || !emailUser || !emailPass) {
      throw new HttpException('إعدادات البريد الإلكتروني غير مكتملة', HttpStatus.INTERNAL_SERVER_ERROR);
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

    const subject = accepted
      ? `تم قبول طلب الاشتراك في "${planName}"`
      : `تم رفض طلب الاشتراك في "${planName}"`;

    const html = accepted
      ? `<h3>مرحبًا ${companyName}</h3><p>تم قبول طلب الاشتراك في خطة "${planName}".</p><p>تم تفعيل الاشتراك بنجاح.</p>`
      : `<h3>مرحبًا ${companyName}</h3><p>نأسف، تم رفض طلب الاشتراك في خطة "${planName}".</p>
         <p><strong>سبب الرفض:</strong> ${reason ?? 'غير محدد'}.</p>
         <p>يرجى التواصل مع الدعم لمزيد من التفاصيل.</p>`;

    await transporter.sendMail({
      from: emailUser,
      to: email,
      subject,
      html,
    });
  }
}