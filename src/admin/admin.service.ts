import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private readonly adminJwt: AdminJwtService,
    private readonly subscriptionService: SubscriptionService,
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

  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const admin = await this.adminRepo.findOne({ where: { email, isActive: true } });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = { adminId: admin.id, role: 'admin' };
    const accessToken = this.adminJwt.signAccess(payload);
    const refreshToken = this.adminJwt.signRefresh(payload);

    await this.tokenRepo.save({ admin, refreshToken });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
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
    return { accessToken };
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    await this.tokenRepo.delete({ refreshToken });
    return { success: true };
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
    await this.companyRepo.update(id, dto);
    return this.companyRepo.findOne({ where: { id } });
  }

  async deleteCompany(id: string): Promise<void> {
    await this.companyRepo.delete(id);
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
      }))
    };

    return {
      message: 'تم تحميل البيانات بنجاح',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}