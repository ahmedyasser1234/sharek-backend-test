// admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
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

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectRepository(Manager) private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanySubscription) private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(AdminToken) private readonly tokenRepo: Repository<AdminToken>,
    @InjectRepository(ManagerToken) private readonly managerTokenRepo: Repository<ManagerToken>,
    @InjectRepository(CompanyActivity) private readonly companyActivityRepo: Repository<CompanyActivity>,
    @InjectRepository(CompanyToken) private readonly companyTokenRepo: Repository<CompanyToken>,
    @InjectRepository(CompanyLoginLog) private readonly companyLoginLogRepo: Repository<CompanyLoginLog>,
    @InjectRepository(BankAccount) private readonly bankAccountRepo: Repository<BankAccount>,
    private readonly adminJwt: AdminJwtService,
    private readonly subscriptionService: SubscriptionService,
    private readonly dataSource: DataSource,
  ) {}

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
    console.log(`تم إنشاء الأدمن الأساسي: ${defaultEmail}`);
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
      const subscriptions = await this.subRepo.find({
        relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
        where: [
          { activatedByAdmin: { id: adminId } },
          { activatedBySeller: { createdBy: { id: adminId } } }
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
                (sub.activatedByAdmin ? `${sub.activatedByAdmin.email} (أدمن)` : 'غير معروف'),
              activatedById: sub.activatedBySeller?.id || sub.activatedByAdmin?.id,
              activatorType: sub.activatedBySeller ? 'بائع' : (sub.activatedByAdmin ? 'أدمن' : 'غير معروف'),
              subscriptionDate: sub.startDate,
              planName: sub.plan?.name || 'غير معروف',
              adminEmail: sub.activatedByAdmin?.email,
              sellerEmail: sub.activatedBySeller?.email
            } as CompanyWithActivator;
          } catch (error) {
            console.error(`Error processing subscription ${sub.id}:`, error);
            return null;
          }
        })
      );

      return results.filter((item): item is CompanyWithActivator => item !== null);
    } catch (error) {
      console.error('Error in getAdminCompanies:', error);
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

  async getStats(): Promise<{ companies: number; employees: number; activeSubscriptions: number }> {
    const companies = await this.companyRepo.count();
    const employees = await this.employeeRepo.count();
    const activeSubs = await this.subRepo.count({
      where: { status: SubscriptionStatus.ACTIVE },
    });

    return { companies, employees, activeSubscriptions: activeSubs };
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
        relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'],
        where: {
          company: { id: Not(IsNull()) }
        }
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
              (sub.activatedByAdmin ? `${sub.activatedByAdmin.email} (أدمن)` : 'غير معروف'),
              activatedById: sub.activatedBySeller?.id || sub.activatedByAdmin?.id,
              activatorType: sub.activatedBySeller ? 'بائع' : (sub.activatedByAdmin ? 'أدمن' : 'غير معروف'),
              subscriptionDate: sub.startDate,
              planName: sub.plan?.name || 'غير معروف',
              adminEmail: sub.activatedByAdmin?.email,
              sellerEmail: sub.activatedBySeller?.email
            } as CompanyWithActivator;
          } catch (error) {
            console.error(`Error processing subscription ${sub.id}:`, error);
            return null;
          }
        })
      );

      return results.filter((item): item is CompanyWithActivator => item !== null);
    } catch (error) {
      console.error('Error in getAllCompaniesWithActivator:', error);
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
  planId: string
): Promise<CompanySubscription | null> {
  console.log(`=== محاولة تغيير خطة الاشتراك ===`);
  console.log(`📋 الاشتراك: ${subscriptionId}`);
  console.log(`🎯 الخطة الجديدة: ${planId}`);
  
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const subscription = await queryRunner.manager.findOne(CompanySubscription, {
      where: { id: subscriptionId },
      relations: ['company', 'plan']
    });
    
    console.log(`🔍 البحث عن الاشتراك: ${subscriptionId}`);
    console.log(`✅ الاشتراك الموجود: ${subscription ? `نعم (ID: ${subscription.id})` : 'لا'}`);
    
    if (!subscription) {
      console.log(`❌ الاشتراك غير موجود: ${subscriptionId}`);
      throw new NotFoundException('الاشتراك غير موجود');
    }

    const newPlan = await queryRunner.manager.findOne(Plan, {
      where: { id: planId }
    });
    
    if (!newPlan) {
      console.log(`❌ الخطة غير موجودة: ${planId}`);
      throw new NotFoundException('الخطة غير موجودة');
    }

    console.log(`📈 تغيير الخطة من "${subscription.plan?.name}" إلى "${newPlan.name}"`);

    subscription.plan = newPlan;
    subscription.price = newPlan.price;
    subscription.currency = 'SAR';
    
    const isFreePlan = newPlan.price === 0;
    
    if (isFreePlan) {
      subscription.status = SubscriptionStatus.ACTIVE;
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      subscription.endDate = oneYearLater;
      console.log(`🆓 الخطة مجانية، تم التفعيل فوراً`);
    } else {
      subscription.status = SubscriptionStatus.PENDING;
      if (newPlan.durationInDays) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + newPlan.durationInDays);
        subscription.endDate = endDate;
      }
      console.log(`💰 الخطة مدفوعة، بحاجة للدفع`);
    }
    
    // طباعة التاريخ بشكل صحيح
    if (subscription.endDate) {
      console.log(`📅 تاريخ الانتهاء الجديد: ${subscription.endDate.toISOString().split('T')[0]}`);
    }
    
    console.log(`📊 حالة الاشتراك الجديدة: ${subscription.status}`);
    
    await queryRunner.manager.save(subscription);

    // تحديث حالة الشركة بشكل آمن
    const statusStr = subscription.status.toString();
    let companyStatus: 'active' | 'inactive' | 'expired';
    
    if (statusStr === 'active') {
      companyStatus = 'active';
    } else if (statusStr === 'expired') {
      companyStatus = 'expired';
    } else {
      companyStatus = 'inactive';
    }
    
    console.log(`🏢 تحديث حالة الشركة ${subscription.company.id} إلى "${companyStatus}"`);
    
    await queryRunner.manager.update(Company, subscription.company.id, {
      subscriptionStatus: companyStatus
    });

    await queryRunner.commitTransaction();
    
    console.log(`✅ تم تغيير الخطة بنجاح!`);
    console.log('=================================');
    
    return subscription;
  } catch (error: unknown) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error changing subscription plan:', error);
    
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
    planId: string
  ): Promise<CompanySubscription> {
    console.log(`=== بدء تغيير خطة الشركة ===`);
    console.log(` الشركة: ${companyId}`);
    console.log(` الخطة الجديدة: ${planId}`);
    
    const currentSubscription = await this.subRepo.findOne({
      where: { company: { id: companyId } },
      order: { createdAt: 'DESC' },
      relations: ['company', 'plan']
    });
    
    if (!currentSubscription) {
      console.log(` لا يوجد اشتراك حالي للشركة ${companyId}`);
      throw new NotFoundException('لا يوجد اشتراك حالي للشركة');
    }
    
    console.log(` الاشتراك الحالي للشركة: ${currentSubscription.id}`);
    console.log(` الشركة: ${currentSubscription.company?.name || 'غير معروف'} (${companyId})`);
    console.log(` الخطة الحالية: ${currentSubscription.plan?.name || 'غير معروف'} (${currentSubscription.planId})`);
    console.log(` الحالة الحالية: ${currentSubscription.status}`);
    
    const newPlan = await this.planRepo.findOne({
      where: { id: planId }
    });
    
    if (!newPlan) {
      console.log(` الخطة غير موجودة: ${planId}`);
      throw new NotFoundException('الخطة غير موجودة');
    }
    
    console.log(` الخطة الجديدة: ${newPlan.name} (${newPlan.id})`);
    console.log(` سعر الخطة الجديدة: ${newPlan.price} ريال`);
    
    const updatedSubscription = await this.changeSubscriptionPlan(currentSubscription.id, planId);
    
    if (!updatedSubscription) {
      console.log(` فشل في تغيير خطة الشركة`);
      throw new InternalServerErrorException('فشل في تغيير خطة الشركة');
    }
    
    console.log(` تم تغيير خطة الشركة بنجاح!`);
    console.log(` من "${currentSubscription.plan?.name}" إلى "${updatedSubscription.plan?.name}"`);
    console.log(` الحالة الجديدة: ${updatedSubscription.status}`);
    console.log('=================================');
    
    return updatedSubscription;
  }

  async upgradeCompanySubscription(
    companyId: string, 
    planId: string
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
        order: { createdAt: 'DESC' }
      });

      const newPlan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId }
      });
      
      if (!newPlan) {
        throw new NotFoundException('الخطة غير موجودة');
      }

      const isFreePlan = newPlan.price === 0;

      const newStatus = isFreePlan ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PENDING;
      
      const newSubscription = this.subRepo.create({
        company,
        plan: newPlan,
        price: newPlan.price,
        currency: 'SAR',
        startDate: new Date(),
        status: newStatus,
      });

      if (isFreePlan) {
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        newSubscription.endDate = oneYearLater;
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

      let companyStatus: 'active' | 'inactive' | 'expired';
      
      if (newStatus === SubscriptionStatus.ACTIVE) {
        companyStatus = 'active';
      } else {
        companyStatus = 'inactive';
      }
      
      company.subscriptionStatus = companyStatus;
      await queryRunner.manager.save(Company, company);

      await queryRunner.commitTransaction();
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
      const result = await this.subscriptionService.subscribe(
        companyId,       
        planId, 
        true, 
        undefined,
        adminId
      );
    
      const subscriptionResult: SubscriptionResult = {
        message: result.message,
        redirectToDashboard: result.redirectToDashboard,
        redirectToPayment: result.redirectToPayment,
        checkoutUrl: result.checkoutUrl,
        subscription: result.subscription,
      };
    
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
      bankAccounts
    };

    return {
      message: 'تم تحميل البيانات بنجاح',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}