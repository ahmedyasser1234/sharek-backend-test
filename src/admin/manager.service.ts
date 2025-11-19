import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
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

@Injectable()
export class ManagerService {
  constructor(
    @InjectRepository(Manager) private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanySubscription) private readonly subRepo: Repository<CompanySubscription>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(ManagerToken) private readonly tokenRepo: Repository<ManagerToken>,
    private readonly managerJwt: ManagerJwtService,
  ) {}

  async ensureDefaultManager() {
    const defaultEmail = 'manager@system.local';
    const defaultPassword = 'manager123';

    const exists = await this.managerRepo.findOne({ where: { email: defaultEmail } });
    if (exists) return;

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const manager = this.managerRepo.create({
      email: defaultEmail,
      password: hashedPassword,
      role: ManagerRole.MANAGER,
    });

    await this.managerRepo.save(manager);
    console.log(`تم إنشاء المدير الأساسي: ${defaultEmail}`);
  }

  async login(email: string, password: string) {
    const manager = await this.managerRepo.findOne({ 
      where: { email, isActive: true } 
    });
    
    if (!manager || !(await bcrypt.compare(password, manager.password))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = { 
      managerId: manager.id, 
      role: manager.role,
      permissions: this.getPermissions(manager.role)
    };
    
    const accessToken = this.managerJwt.signAccess(payload);
    const refreshToken = this.managerJwt.signRefresh(payload);

    await this.tokenRepo.save({ manager, refreshToken });

    return { accessToken, refreshToken, role: manager.role };
  }

  async refresh(refreshToken: string) {
    const token = await this.tokenRepo.findOne({
      where: { refreshToken },
      relations: ['manager'],
    });

    if (!token) throw new UnauthorizedException('توكن غير صالح');

    const payload = this.managerJwt.verifyRefresh(refreshToken);
    if (!payload || payload.managerId !== token.manager.id) {
      throw new UnauthorizedException('توكن غير مطابق');
    }

    const accessToken = this.managerJwt.signAccess(payload);
    return { accessToken };
  }

  async logout(refreshToken: string) {
    await this.tokenRepo.delete({ refreshToken });
    return { success: true };
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
        const count = await this.employeeRepo.count({ 
          where: { company: { id: company.id } } 
        });
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
    const restrictedFields = ['subscriptionStatus', 'planId'];
    restrictedFields.forEach(field => {
      if (dto[field]) {
        throw new ForbiddenException('غير مسموح بتعديل حالة الاشتراك أو الخطة');
      }
    });

    await this.companyRepo.update(id, dto);
    return this.companyRepo.findOne({ where: { id } });
  }

  async deleteCompany(id: string) {
    await this.companyRepo.delete(id);
  }

  async getEmployeesByCompany(companyId: string) {
    return this.employeeRepo.find({ 
      where: { company: { id: companyId } } 
    });
  }

  async deleteEmployee(id: number) {
    await this.employeeRepo.delete(id);
  }

  async getAllSubscriptions() {
    return this.subRepo.find({ 
      relations: ['company', 'plan'] 
    });
  }

  async activateSubscription(id: string) {
    await this.subRepo.update(id, { status: SubscriptionStatus.ACTIVE });
    return this.subRepo.findOne({ where: { id } });
  }

  changeSubscriptionPlan(): never {
    throw new ForbiddenException('غير مسموح بتغيير خطط الاشتراكات');
  }

  private getPermissions(role: ManagerRole) {
    const basePermissions = {
      canViewStats: true,
      canManageCompanies: true,
      canManageEmployees: true,
      canManageSubscriptions: true,
      canViewSubscriptions: true,
    };

    if (role === ManagerRole.SUPER_ADMIN) {
      return {
        ...basePermissions,
        canManagePlans: true,
        canChangeSubscriptionPlans: true,
        canManageManagers: true,
      };
    }

    return {
      ...basePermissions,
      canManagePlans: false,
      canChangeSubscriptionPlans: false,
      canManageManagers: false,
    };
  }

  hasPermission(manager: Manager, permission: string): boolean {
    const permissions = this.getPermissions(manager.role);
    return permissions[permission] === true;
  }
}