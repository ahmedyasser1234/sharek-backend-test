import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Manager, ManagerRole } from './entities/manager.entity';
import { Company } from '../company/entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CompanySubscription, SubscriptionStatus } from '../subscription/entities/company-subscription.entity';
import { Plan } from '../plan/entities/plan.entity';
import * as bcrypt from 'bcryptjs';
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
}

@Injectable()
export class SellerService {
  private readonly logger = new Logger(SellerService.name);

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
  ) {}

  async ensureDefaultSeller(): Promise<void> {
    const defaultEmail = 'seller@system.local';
    const defaultPassword = 'seller123';

    const exists = await this.sellerRepo.findOne({ where: { email: defaultEmail } });
    if (exists) return;

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const seller = this.sellerRepo.create({
      email: defaultEmail,
      password: hashedPassword,
      role: ManagerRole.SELLER,
    });

    await this.sellerRepo.save(seller);
    console.log(`تم إنشاء البائع الأساسي: ${defaultEmail}`);
  }

  async login(email: string, password: string): Promise<{ 
    accessToken: string; 
    refreshToken: string; 
    role: ManagerRole 
  }> {
    const seller = await this.sellerRepo.findOne({ 
      where: { email, isActive: true } 
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

    return { accessToken, refreshToken, role: seller.role };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
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
    
    this.logger.log(`تم تجديد التوكن بنجاح للبائع: ${token.manager.email}`);
    
    return { accessToken };
    
  } catch (error: unknown) {
    // أصلح هذا السطر - تحقق من نوع error أولاً
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

  async getStats(sellerId?: string): Promise<{ 
    companies: number; 
    employees: number; 
    activeSubscriptions: number 
  }> {
    let companies = 0;
    let activeSubs = 0;

    if (sellerId) {
      const sellerSubscriptions = await this.subRepo.find({
        where: { activatedBySellerId: sellerId },
        relations: ['company']
      });
      
      companies = sellerSubscriptions.length;
      activeSubs = sellerSubscriptions.filter(sub => sub.status === SubscriptionStatus.ACTIVE).length;
    } else {
      companies = await this.companyRepo.count();
      activeSubs = await this.subRepo.count({
        where: { status: SubscriptionStatus.ACTIVE },
      });
    }

    const employees = await this.employeeRepo.count();

    return { companies, employees, activeSubscriptions: activeSubs };
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
          planName: subscription.plan.name,
        };
      }),
    );

    return result;
  }

  async getSellerCompanies(sellerId: string): Promise<CompanyWithEmployeeCount[]> {
    const subscriptions = await this.subRepo.find({
      where: { activatedBySellerId: sellerId },
      relations: ['company', 'plan', 'activatedBySeller'],
    });

    return await Promise.all(
      subscriptions.map(async (sub) => {
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
          activatedBy: `${sub.activatedBySeller?.email || 'غير معروف'} (بائع)`,
          activatorType: 'بائع',
          subscriptionDate: sub.startDate,
          planName: sub.plan.name,
        };
      })
    );
  }

  async getAllCompaniesWithActivator(): Promise<(CompanyWithEmployeeCount & { activatedById?: string })[]> {
    const subscriptions = await this.subRepo.find({
      relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
    });

    return await Promise.all(
      subscriptions.map(async (sub) => {
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
          planName: sub.plan.name,
        };
      })
    );
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
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        true, 
        sellerId, 
        undefined
      );
      
      this.logger.log(`تم الاشتراك بنجاح للشركة ${companyId} في الخطة ${planId} بواسطة البائع ${sellerId}`);
      
      if (result && typeof result === 'object' && 'message' in result) {
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
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'message' in obj &&
      'deletedSubscriptions' in obj &&
      'disconnectedPlans' in obj &&
      'companyStatus' in obj &&
      'note' in obj &&
      typeof (obj as CancelSubscriptionResult).message === 'string' &&
      typeof (obj as CancelSubscriptionResult).deletedSubscriptions === 'number' &&
      Array.isArray((obj as CancelSubscriptionResult).disconnectedPlans) &&
      typeof (obj as CancelSubscriptionResult).companyStatus === 'string' &&
      typeof (obj as CancelSubscriptionResult).note === 'string'
    );
  }

  private isExtendSubscriptionResult(obj: unknown): obj is ExtendSubscriptionResult {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'message' in obj &&
      'subscription' in obj &&
      typeof (obj as ExtendSubscriptionResult).message === 'string' &&
      typeof (obj as ExtendSubscriptionResult).subscription === 'object' &&
      (obj as ExtendSubscriptionResult).subscription !== null
    );
  }

  private isPlanChangeValidation(obj: unknown): obj is PlanChangeValidation {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'canChange' in obj &&
      'message' in obj &&
      'currentPlanMax' in obj &&
      'newPlanMax' in obj &&
      'currentEmployees' in obj &&
      'action' in obj &&
      typeof (obj as PlanChangeValidation).canChange === 'boolean' &&
      typeof (obj as PlanChangeValidation).message === 'string' &&
      typeof (obj as PlanChangeValidation).currentPlanMax === 'number' &&
      typeof (obj as PlanChangeValidation).newPlanMax === 'number' &&
      typeof (obj as PlanChangeValidation).currentEmployees === 'number' &&
      typeof (obj as PlanChangeValidation).action === 'string'
    );
  }

  async changeSubscriptionPlanSeller(companyId: string, newPlanId: string): Promise<SubscriptionResult> {
    try {
      this.logger.log(`البائع يغير خطة الشركة ${companyId} إلى ${newPlanId}`);
      
      const result = await this.subscriptionService.changeSubscriptionPlan(companyId, newPlanId) as SubscriptionResult;
      
      if (result && typeof result.message === 'string') {
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
      
      const result = await this.subscriptionService.subscribe(
        companyId, 
        planId, 
        true, 
        sellerId, 
        undefined
      );
      
      this.logger.log(`تم التفعيل اليدوي للشركة ${companyId} بنجاح بواسطة البائع ${sellerId}`);
      
      if (result && typeof result === 'object' && 'message' in result) {
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

      return proofs.map((proof) => ({
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
      }));
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

  async approveProof(proofId: string): Promise<ApproveRejectResult> {
    try {
      this.logger.log(`البائع يوافق على طلب التحويل ${proofId}`);
      
      const result = await this.paymentService.approveProof(proofId);
      
      this.logger.log(`تم قبول الطلب ${proofId} بنجاح`);
      
      if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
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
}