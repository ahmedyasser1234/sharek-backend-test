// src/admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
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
    private readonly adminJwt: AdminJwtService,
  ) {}

  async ensureDefaultAdmin() {
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

  async login(email: string, password: string) {
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

  async refresh(refreshToken: string) {
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

  async logout(refreshToken: string) {
    await this.tokenRepo.delete({ refreshToken });
    return { success: true };
  }

  async createAdmin(dto: { email: string; password: string }) {
    const exists = await this.adminRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const admin = this.adminRepo.create({
      email: dto.email,
      password: hashedPassword,
    });

    return this.adminRepo.save(admin);
  }

  async createManager(adminId: string, dto: { email: string; password: string; role?: ManagerRole }) {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    const exists = await this.managerRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const manager = this.managerRepo.create({
      email: dto.email,
      password: hashedPassword,
      role: dto.role || ManagerRole.MANAGER,
      createdBy: admin,
    });

    const savedManager = await this.managerRepo.save(manager);
    
    const { password, ...result } = savedManager;
    void password; 
    return result;
  }

  async getAllManagers() {
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
      createdBy: manager.createdBy ? { id: manager.createdBy.id, email: manager.createdBy.email } : null
    }));
  }

  async updateManager(id: string, dto: Partial<Manager>) {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('المدير غير موجود');

    if (dto.email && dto.email !== manager.email) {
      const emailExists = await this.managerRepo.findOne({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(manager, dto);
    const updatedManager = await this.managerRepo.save(manager);
    
    const { password, ...result } = updatedManager;
    void password; 
    return result;
  }

  async toggleManagerStatus(id: string, isActive: boolean) {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('المدير غير موجود');

    manager.isActive = isActive;
    const updatedManager = await this.managerRepo.save(manager);
    
    const { password, ...result } = updatedManager;
    void password; 
    return result;
  }

  async deleteManager(id: string) {
    const manager = await this.managerRepo.findOne({ where: { id } });
    if (!manager) throw new NotFoundException('المدير غير موجود');

    await this.managerRepo.delete(id);
    return { message: 'تم حذف المدير بنجاح' };
  }

  async updateAdmin(id: string, dto: Partial<Admin>) {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('الأدمن غير موجود');

    Object.assign(admin, dto);
    return this.adminRepo.save(admin);
  }

  async getStats() {
    const companies = await this.companyRepo.count();
    const employees = await this.employeeRepo.count();
    const activeSubs = await this.subRepo.count({
      where: { status: SubscriptionStatus.ACTIVE },
    });

    return { companies, employees, activeSubscriptions: activeSubs };
  }

  async getAllCompaniesWithEmployeeCount() {
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

  async toggleCompany(id: string, isActive: boolean) {
    await this.companyRepo.update(id, { isActive });
    return this.companyRepo.findOne({ where: { id } });
  }

  async updateCompany(id: string, dto: Partial<Company>) {
    await this.companyRepo.update(id, dto);
    return this.companyRepo.findOne({ where: { id } });
  }

  async deleteCompany(id: string) {
    await this.companyRepo.delete(id);
  }

  async getEmployeesByCompany(companyId: string) {
    return this.employeeRepo.find({ where: { company: { id: companyId } } });
  }

  async deleteEmployee(id: number) {
    await this.employeeRepo.delete(id);
  }

  async getAllSubscriptions() {
    return this.subRepo.find({ relations: ['company', 'plan'] });
  }

  async activateSubscription(id: string) {
    await this.subRepo.update(id, { status: SubscriptionStatus.ACTIVE });
    return this.subRepo.findOne({ where: { id } });
  }

  async changeSubscriptionPlan(id: string, planId: string) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('الخطة غير موجودة');
    await this.subRepo.update(id, { plan });
    return this.subRepo.findOne({ where: { id } });
  }

  async downloadDatabase() {
    const data = {
      companies: await this.companyRepo.find(),
      employees: await this.employeeRepo.find(),
      subscriptions: await this.subRepo.find({ relations: ['company', 'plan'] }),
      plans: await this.planRepo.find(),
      admins: await this.adminRepo.find({ 
        select: ['id', 'email', 'isActive', 'createdAt' as any] 
      }),
      managers: await this.managerRepo.find({ 
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
      }),
    };

    return {
      message: 'تم تحميل البيانات بنجاح',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}