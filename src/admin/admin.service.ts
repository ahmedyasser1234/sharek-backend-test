import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, IsNull } from 'typeorm';
import { Admin, AdminRole } from './entities/admin.entity';
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
import { AdminBankDto } from './dto/admin-bank.dto';

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
  };
  timestamp: string;
}

export interface AdminBankInfo {
  bankName?: string;
  accountNumber?: string;
  ibanNumber?: string;
}

export interface AdminFullBankInfo {
  adminId: string;
  email: string;
  bankName?: string;
  accountNumber?: string;
  ibanNumber?: string;
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
      role: AdminRole.SUPER_ADMIN,
    });

    await this.adminRepo.save(admin);
    console.log(`تم إنشاء الأدمن الأساسي (سوبر أدمن): ${defaultEmail}`);
  }

  async getAdminById(adminId: string): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');
    return admin;
  }

  async updateBankInfo(adminId: string, dto: AdminBankDto): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    if (dto.bankName !== undefined) admin.bankName = dto.bankName;
    if (dto.accountNumber !== undefined) admin.accountNumber = dto.accountNumber;
    if (dto.ibanNumber !== undefined) admin.ibanNumber = dto.ibanNumber;

    return this.adminRepo.save(admin);
  }

  async getAdminBankInfo(adminId: string): Promise<AdminBankInfo> {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId },
      select: ['bankName', 'accountNumber', 'ibanNumber']
    });

    if (!admin) {
      throw new NotFoundException('الأدمن غير موجود');
    }

    return {
      bankName: admin.bankName,
      accountNumber: admin.accountNumber,
      ibanNumber: admin.ibanNumber
    };
  }

  async getAllAdminsBankInfo(): Promise<AdminFullBankInfo[]> {
    const admins = await this.adminRepo.find({
      select: ['id', 'email', 'bankName', 'accountNumber', 'ibanNumber']
    });

    return admins.map(admin => ({
      adminId: admin.id,
      email: admin.email,
      bankName: admin.bankName,
      accountNumber: admin.accountNumber,
      ibanNumber: admin.ibanNumber
    }));
  }

  async getBankInfoPublic(): Promise<AdminFullBankInfo[]> {
    const admins = await this.adminRepo.find({
      where: { isActive: true },
      select: ['id', 'email', 'bankName', 'accountNumber', 'ibanNumber']
    });

    return admins
      .filter(admin => admin.bankName || admin.accountNumber || admin.ibanNumber)
      .map(admin => ({
        adminId: admin.id,
        email: admin.email,
        bankName: admin.bankName,
        accountNumber: admin.accountNumber,
        ibanNumber: admin.ibanNumber
      }));
  }

  async updateAdminRole(adminId: string, role: AdminRole): Promise<Admin> {
    const admin = await this.getAdminById(adminId);
    admin.role = role;
    return this.adminRepo.save(admin);
  }

  async getAllAdminsWithRoles(): Promise<Admin[]> {
    return this.adminRepo.find({
      select: ['id', 'email', 'role', 'isActive', 'createdAt'],
    });
  }

  async createAdmin(dto: { 
    email: string; 
    password: string; 
    role?: AdminRole;
    bankInfo?: AdminBankDto;
  }): Promise<Admin> {
    const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const admin = this.adminRepo.create({
      email: dto.email,
      password: hashedPassword,
      role: dto.role || AdminRole.SUPERVISOR,
      bankName: dto.bankInfo?.bankName,
      accountNumber: dto.bankInfo?.accountNumber,
      ibanNumber: dto.bankInfo?.ibanNumber,
    });

    return this.adminRepo.save(admin);
  }

  async canSupervisorAccess(adminId: string, resource: string): Promise<boolean> {
    const admin = await this.getAdminById(adminId);
    return admin.canAccess(resource);
  }

  async getSupervisorCompanies(adminId: string): Promise<CompanyWithActivator[]> {
    const admin = await this.getAdminById(adminId);
    
    if (admin.role === AdminRole.SUPER_ADMIN) {
      return this.getAdminCompanies(adminId);
    }
    
    return this.getAllCompaniesWithActivator();
  }

  async getSupervisorManagers(adminId: string): Promise<ManagerWithoutPassword[]> {
    const admin = await this.getAdminById(adminId);
    
    if (admin.role === AdminRole.SUPER_ADMIN) {
      return this.getAllManagers();
    }
    
    return this.getAllManagers();
  }

  async login(email: string, password: string): Promise<{ 
    accessToken: string; 
    refreshToken: string;
    admin: { email: string; role: AdminRole };
  }> {
    const admin = await this.adminRepo.findOne({ 
      where: { email, isActive: true } 
    });
    
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = { adminId: admin.id, role: admin.role };
    const accessToken = this.adminJwt.signAccess(payload);
    const refreshToken = this.adminJwt.signRefresh(payload);

    await this.tokenRepo.save({ admin, refreshToken });

    return { 
      accessToken, 
      refreshToken, 
      admin: { email: admin.email, role: admin.role }
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

  async createManager(
    adminId: string, 
    dto: { email: string; password: string }
  ): Promise<ManagerWithoutPassword> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    const normalizedEmail = dto.email.toLowerCase().trim();
    
    const exists = await this.managerRepo.findOne({ 
      where: { normalizedEmail: normalizedEmail } 
    });
    
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const manager = this.managerRepo.create({
      email: normalizedEmail,
      normalizedEmail: normalizedEmail,
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
      relations: ['createdBy', 'activatedSubscriptions'],
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
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
      activatedSubscriptions: manager.activatedSubscriptions || []
    })) as ManagerWithoutPassword[];
  }

  async getAllManagersWithStats(): Promise<any[]> {
    const managers = await this.managerRepo.find({
      relations: ['createdBy', 'activatedSubscriptions'],
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
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
      id: manager.id,
      email: manager.email,
      normalizedEmail: manager.normalizedEmail,
      role: manager.role,
      isActive: manager.isActive,
      createdAt: manager.createdAt,
      subscriptionCount: manager.activatedSubscriptions?.length || 0,
      createdBy: manager.createdBy ? { 
        id: manager.createdBy.id, 
        email: manager.createdBy.email 
      } : null
    }));
  }

  async updateManager(id: string, dto: Partial<Manager>): Promise<ManagerWithoutPassword> {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('البائع غير موجود');

    if (dto.email && dto.email !== manager.email) {
      const normalizedEmail = dto.email.toLowerCase().trim();
      const emailExists = await this.managerRepo.findOne({ 
        where: { normalizedEmail: normalizedEmail } 
      });
      if (emailExists && emailExists.id !== id) {
        throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
      }
      dto.email = normalizedEmail;
      dto.normalizedEmail = normalizedEmail;
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

  async transferManagerSubscriptionsToAdmin(
    managerId: string, 
    adminId: string
  ): Promise<{ message: string; transferredCount: number }> {
    const manager = await this.managerRepo.findOne({ where: { id: managerId } });
    if (!manager) throw new NotFoundException('البائع غير موجود');

    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    const subscriptionCount = await this.subRepo.count({
      where: { activatedBySeller: { id: managerId } }
    });

    if (subscriptionCount === 0) {
      return {
        message: 'لا توجد اشتراكات مرتبطة بالبائع',
        transferredCount: 0
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query(
        `UPDATE company_subscriptions 
         SET "activatedBySellerId" = NULL, 
             "activatedByAdminId" = $1
         WHERE "activatedBySellerId" = $2`,
        [adminId, managerId]
      );

      return {
        message: `تم نقل ${subscriptionCount} اشتراك بنجاح إلى الأدمن ${admin.email}`,
        transferredCount: subscriptionCount
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
      throw new InternalServerErrorException('فشل في نقل الاشتراكات: ' + errorMessage);
    } finally {
      await queryRunner.release();
    }
  }

  async deleteManager(id: string): Promise<{ message: string }> {
    const manager = await this.managerRepo.findOne({ 
      where: { id },
      relations: ['createdBy', 'activatedSubscriptions']
    });
    
    if (!manager) throw new NotFoundException('البائع غير موجود');

    const subscriptionCount = await this.subRepo.count({
      where: { activatedBySeller: { id } }
    });

    if (subscriptionCount > 0) {
      if (!manager.createdBy) {
        throw new BadRequestException(
          `لا يمكن حذف البائع لأنه مرتبط بـ ${subscriptionCount} اشتراك/اشتراكات ولا يوجد أدمن مرتبط به لنقل الاشتراكات إليه.`
        );
      }

      await this.transferManagerSubscriptionsToAdmin(id, manager.createdBy.id);
    }

    await this.managerTokenRepo.delete({ manager: { id } });
    
    await this.managerRepo.delete(id);
    
    return { 
      message: subscriptionCount > 0 
        ? `تم حذف البائع ونقل ${subscriptionCount} اشتراك إلى الأدمن ${manager.createdBy?.email || 'غير معروف'}`
        : 'تم حذف البائع بنجاح'
    };
  }

  async deleteManagerForce(id: string, adminId?: string): Promise<{ message: string }> {
    const manager = await this.managerRepo.findOne({ 
      where: { id },
      relations: ['createdBy']
    });
    
    if (!manager) throw new NotFoundException('البائع غير موجود');

    const subscriptionCount = await this.subRepo.count({
      where: { activatedBySeller: { id } }
    });

    if (subscriptionCount > 0) {
      let targetAdminId = adminId;
      
      if (!targetAdminId && manager.createdBy) {
        targetAdminId = manager.createdBy.id;
      } else if (!targetAdminId) {
        const defaultAdmin = await this.adminRepo.findOne({ 
          where: { email: 'admin@system.local' } 
        });
        
        if (!defaultAdmin) {
          const anyAdmin = await this.adminRepo.findOne({
            where: { isActive: true }
          });          
          if (!anyAdmin) {
            throw new BadRequestException(
              `لا يمكن حذف البائع لأنه مرتبط بـ ${subscriptionCount} اشتراك/اشتراكات ولا يوجد أدمن لنقل الاشتراكات إليه.`
            );
          }
          targetAdminId = anyAdmin.id;
        } else {
          targetAdminId = defaultAdmin.id;
        }
      }

      await this.transferManagerSubscriptionsToAdmin(id, targetAdminId);
    }

    await this.managerTokenRepo.delete({ manager: { id } });
    
    await this.managerRepo.delete(id);
    
    return { 
      message: subscriptionCount > 0 
        ? `تم حذف البائع ونقل ${subscriptionCount} اشتراك إلى الأدمن`
        : 'تم حذف البائع بنجاح'
    };
  }

  async updateAdmin(id: string, dto: Partial<Admin>): Promise<Admin> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    Object.assign(admin, dto);
    return this.adminRepo.save(admin);
  }

  async getStats(): Promise<{ 
    companies: number; 
    employees: number; 
    activeSubscriptions: number;
    managers: number;
    admins: number;
  }> {
    const companies = await this.companyRepo.count();
    const employees = await this.employeeRepo.count();
    const activeSubs = await this.subRepo.count({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    const managers = await this.managerRepo.count();
    const admins = await this.adminRepo.count();

    return { companies, employees, activeSubscriptions: activeSubs, managers, admins };
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
    return this.subRepo.find({ 
      relations: ['company', 'plan', 'activatedBySeller', 'activatedByAdmin'] 
    });
  }

  async activateSubscription(id: string): Promise<CompanySubscription | null> {
    await this.subRepo.update(id, { status: SubscriptionStatus.ACTIVE });
    return this.subRepo.findOne({ where: { id } });
  }

  async changeSubscriptionPlan(id: string, planId: string): Promise<CompanySubscription | null> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('الخطة غير موجودة');
    await this.subRepo.update(id, { plan });
    return this.subRepo.findOne({ where: { id } });
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
      select: ['id', 'email', 'isActive', 'createdAt', 'bankName', 'accountNumber', 'ibanNumber'] as (keyof Admin)[]
    });

    const managers = await this.managerRepo.find({ 
      relations: ['createdBy'],
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        role: true,
        isActive: true,
        createdAt: true,
        createdBy: {
          id: true,
          email: true,
        }
      }
    });

    const data = {
      companies,
      employees,
      subscriptions,
      plans,
      admins,
      managers: managers.map(manager => ({
        id: manager.id,
        email: manager.email,
        normalizedEmail: manager.normalizedEmail,
        role: manager.role,
        isActive: manager.isActive,
        createdAt: manager.createdAt,
        createdBy: manager.createdBy ? {
          id: manager.createdBy.id,
          email: manager.createdBy.email
        } : null
      }))
    };

    return {
      message: 'تم تحميل البيانات بنجاح',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}