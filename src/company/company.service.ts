import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Company } from './entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import bcrypt from 'bcryptjs';
import { CompanyJwtService, CompanyPayload } from './auth/company-jwt.service';
import { CompanyToken } from './auth/entities/company-token.entity';
import { CompanyLoginLog } from './auth/entities/company-login-log.entity';
import { v4 as uuid } from 'uuid';
import { mkdirSync, renameSync } from 'fs';
import { join } from 'path';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(CompanyToken)
    private readonly tokenRepo: Repository<CompanyToken>,
    @InjectRepository(CompanyLoginLog)
    private readonly loginLogRepo: Repository<CompanyLoginLog>,
    public readonly jwtService: CompanyJwtService,
  ) {}

  async countEmployees(companyId: string): Promise<number> {
    return this.employeeRepo.count({
      where: { company: { id: companyId } },
    });
  }

  async createCompany(dto: CreateCompanyDto, logo?: Express.Multer.File): Promise<Company> {
    this.logger.log(`✅ بدء إنشاء شركة جديدة: ${dto.email}`);
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = uuid();
    const tempId = uuid();

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const folderPath = `./uploads/companies/${tempId}`;
    mkdirSync(folderPath, { recursive: true });

    let logoUrl: string | undefined;
    if (logo) {
      const tempPath = join('./uploads/temp', logo.filename);
      const finalPath = join(folderPath, logo.filename);
      renameSync(tempPath, finalPath);
      logoUrl = `${baseUrl}/uploads/companies/${tempId}/${logo.filename}`;
      this.logger.debug(`🖼️ تم نقل اللوجو من temp إلى: ${logoUrl}`);
    }

    const companyData: DeepPartial<Company> = {
      ...dto,
      password: hashedPassword,
      isVerified: false,
      verificationToken,
      provider: dto.provider || 'email',
      logoUrl,
      fontFamily: dto.fontFamily ?? undefined,
      id: tempId,
    };

    const company = this.companyRepo.create(companyData);
    const saved = await this.companyRepo.save(company);

    this.logger.log(`📦 تم حفظ الشركة بنجاح: ${saved.id}`);
    return saved;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, logo?: Express.Multer.File): Promise<Company> {
    this.logger.log(`✏️ تحديث بيانات الشركة: ${id}`);

    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    let logoUrl: string | undefined;
    if (logo) {
      const folderPath = `./uploads/companies/${id}`;
      mkdirSync(folderPath, { recursive: true });
      const tempPath = join('./uploads/temp', logo.filename);
      const finalPath = join(folderPath, logo.filename);
      renameSync(tempPath, finalPath);
      logoUrl = `${baseUrl}/uploads/companies/${id}/${logo.filename}`;
      this.logger.debug(`🖼️ تم نقل اللوجو الجديد إلى: ${logoUrl}`);
    }

    const updateData: Partial<Company> = {
      ...dto,
      logoUrl: logoUrl ?? company.logoUrl,
      fontFamily: dto.fontFamily ?? company.fontFamily,
    };

    await this.companyRepo.update(id, updateData);
    this.logger.log(`✅ تم تحديث الشركة: ${id}`);
    return this.findById(id);
  }

  async verifyEmail(token: string): Promise<string> {
    this.logger.log(`📧 محاولة تفعيل البريد باستخدام التوكن: ${token}`);
    const company = await this.companyRepo.findOne({
      where: { verificationToken: token },
    });
    if (!company) throw new NotFoundException('Invalid token');

    company.isVerified = true;
    company.verificationToken = null;
    await this.companyRepo.save(company);

    this.logger.log(`✅ تم تفعيل البريد الإلكتروني للشركة: ${company.id}`);
    return '✅ تم تفعيل البريد الإلكتروني بنجاح';
  }

  async findByEmail(email: string): Promise<Company> {
    this.logger.debug(`🔍 البحث عن شركة بالبريد: ${email}`);
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findById(id: string): Promise<Company> {
    this.logger.debug(`🔍 البحث عن شركة بالمعرف: ${id}`);
    const company = await this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.employees', 'employee')
      .leftJoinAndSelect('company.subscriptions', 'subscription')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .where('company.id = :id', { id })
      .getOne();

    if (!company) throw new NotFoundException('Company not found');

    this.logger.log(`📦 تم جلب بيانات الشركة: ${company.id}`);
    return company;
  }

  async deleteCompany(id: string): Promise<void> {
    this.logger.warn(`🗑 حذف شركة بالمعرف: ${id}`);
    const company = await this.findById(id);
    await this.companyRepo.remove(company);
    this.logger.log(`✅ تم حذف الشركة: ${id}`);
  }

  async login(
    dto: LoginCompanyDto,
    ip: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    this.logger.log(`🔐 محاولة تسجيل دخول من IP: ${ip} للبريد: ${dto.email}`);

    const company = await this.findByEmail(dto.email);
    if (!company || typeof company !== 'object') {
      this.logger.warn(`❌ بيانات الشركة غير صالحة`);
      throw new UnauthorizedException('Invalid company data');
    }

    if (!company.isActive) {
      this.logger.warn(`❌ الشركة غير مفعلة: ${dto.email}`);
      throw new UnauthorizedException('Company is not active');
    }

    if (!company.isVerified) {
      this.logger.warn(`❌ البريد الإلكتروني غير مفعل: ${dto.email}`);
      throw new UnauthorizedException('Email not verified');
    }

    if (typeof company.comparePassword !== 'function') {
      this.logger.error(`❌ طريقة مقارنة كلمة المرور غير موجودة`);
      throw new UnauthorizedException('Password comparison method missing');
    }

    const isMatch = await company.comparePassword(dto.password);
    if (!isMatch) {
      this.logger.warn(`❌ كلمة المرور غير صحيحة للبريد: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwtService.signAccess({
      companyId: company.id,
      role: company.role,
    });
    const refreshToken = this.jwtService.signRefresh({
      companyId: company.id,
    });

    this.logger.log(`✅ تم إصدار التوكنات للشركة: ${company.id}`);
    await this.tokenRepo.save(this.tokenRepo.create({ refreshToken, company }));
    await this.loginLogRepo.save({ ip, success: true, company });

    return { accessToken, refreshToken };
  }

  async revokeToken(token: string): Promise<void> {
    this.logger.log(`🚫 إلغاء توكن: ${token}`);
    await this.tokenRepo.delete({ refreshToken: token });
  }

  async verifyRefreshToken(token: string): Promise<CompanyPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<CompanyPayload>(token);
      this.logger.log(`✅ تم التحقق من توكن التحديث`);
      return payload;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ فشل في التحقق من توكن التحديث: ${message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    this.logger.log(`🔄 تحديث التوكن`);
    const payload = await this.verifyRefreshToken(token);

    const accessToken = this.jwtService.signAccess({
      companyId: payload.companyId,
      role: payload.role,
    });

    this.logger.log(`✅ تم إصدار Access Token جديد`);
    return { accessToken };
  }

  async logout(token: string): Promise<{ success: boolean }> {
    this.logger.log(`🚪 تسجيل خروج باستخدام التوكن: ${token}`);
    await this.revokeToken(token);
    return { success: true };
  }

  async activateSubscription(
    companyId: string,
    planId: string,
    provider: string,
  ): Promise<void> {
    this.logger.log(`📦 تفعيل اشتراك الشركة ${companyId} بالخطة ${planId} عبر ${provider}`);
    await this.companyRepo.update(companyId, {
      subscriptionStatus: 'active',
      subscribedAt: new Date(),
      planId,
      paymentProvider: provider,
    });
    this.logger.log(`✅ تم تفعيل اشتراك الشركة: ${companyId}`);
  }
}
