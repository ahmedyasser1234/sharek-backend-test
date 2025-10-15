/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Company } from './entities/company.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { LoginCompanyDto } from './dto/login-company.dto';
import { CompanyJwtService, CompanyPayload } from './auth/company-jwt.service';
import { CompanyToken } from './auth/entities/company-token.entity';
import { CompanyLoginLog } from './auth/entities/company-login-log.entity';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import { mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import axios from 'axios';
import { RevokedToken } from './entities/revoked-token.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class CompanyService implements OnModuleInit {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(CompanyToken)
    private readonly tokenRepo: Repository<CompanyToken>,

    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,

    @InjectRepository(CompanyLoginLog)
    private readonly loginLogRepo: Repository<CompanyLoginLog>,

    public readonly jwtService: CompanyJwtService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedDefaultCompany();
  }

  async seedDefaultCompany(): Promise<void> {
    const email = 'admin2@company.com';
    const exists = await this.companyRepo.findOne({ where: { email } });
    if (exists) {
      this.logger.warn(`⚠️ الشركة الافتراضية موجودة بالفعل: ${email}`);
      return;
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);
    const companyData: DeepPartial<Company> = {
      email,
      password: hashedPassword,
      isVerified: true,
      isActive: true,
      provider: 'email',
      id: uuid(),
      role: 'admin',
      name: 'شركة افتراضية',
      phone: '01012345678',
      fontFamily: 'Cairo, sans-serif',
      description: 'شركة تم إنشاؤها تلقائيًا عند بدء التشغيل',
    };

    const company = this.companyRepo.create(companyData);
    await this.companyRepo.save(company);
    this.logger.log(`🌱 تم زرع الشركة الافتراضية: ${email}`);
  }

  async countEmployees(companyId: string): Promise<number> {
    return this.employeeRepo.count({
      where: { company: { id: companyId } },
    });
  }

  async createCompany(dto: CreateCompanyDto, logo?: Express.Multer.File): Promise<Company> {
    const existing = await this.companyRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('📛 هذا البريد مستخدم بالفعل');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
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
    }

    const companyData: DeepPartial<Company> = {
      ...dto,
      password: hashedPassword,
      isVerified: false,
      verificationCode,
      provider: dto.provider || 'email',
      logoUrl,
      fontFamily: dto.fontFamily ?? undefined,
      id: tempId,
      subscriptionStatus: 'inactive',
      planId: null,
      subscribedAt: undefined,
      paymentProvider: undefined,
    };

    const company = this.companyRepo.create(companyData);
    const saved = await this.companyRepo.save(company);

    try {
      await this.sendVerificationCode(saved.email);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ فشل إرسال كود التحقق: ${errorMessage}`);
    }

    return saved;
  }

  async sendVerificationCode(email: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const code: string = Math.floor(100000 + Math.random() * 900000).toString();
    company.verificationCode = code;
    await this.companyRepo.save(company);

    const transportOptions: SMTPTransport.Options = {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER ?? '',
        pass: process.env.EMAIL_PASS ?? '',
      },
    };

    const transporter = nodemailer.createTransport(transportOptions);
    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER ?? '',
      to: email,
      subject: 'رمز التحقق من البريد الإلكتروني',
      text: `كود التفعيل الخاص بك هو: ${code}`,
    };

    try {
      await transporter.sendMail(mailOptions);
      return `✅ تم إرسال كود التحقق إلى ${email}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ فشل إرسال البريد: ${errorMessage}`);
      throw new BadRequestException('فشل إرسال البريد الإلكتروني');
    }
  }

  async verifyCode(email: string, code: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.verificationCode !== code)
      throw new UnauthorizedException('❌ كود غير صحيح');

    company.isVerified = true;
    company.verificationCode = null;
    await this.companyRepo.save(company);

    return '✅ تم تفعيل البريد الإلكتروني بنجاح';
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, logo?: Express.Multer.File): Promise<Company> {
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
    }

    const updateData: Partial<Company> = {
      ...dto,
      logoUrl: logoUrl ?? company.logoUrl,
      fontFamily: dto.fontFamily ?? company.fontFamily,
    };

    await this.companyRepo.update(id, updateData);
    return this.findById(id);
  }

  async findByEmail(email: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findById(id: string): Promise<Company> {
    const company = await this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.employees', 'employee')
      .leftJoinAndSelect('company.subscriptions', 'subscription')

      .where('company.id = :id', { id })
      .getOne();

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async getProfileById(id: string): Promise<Partial<Company>> {
    const company = await this.companyRepo.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'email',
        'phone',
        'logoUrl',
        'description',
        'isActive',
        'role',
        'subscriptionStatus',
        'subscribedAt',
        'planId',
        'paymentProvider',
      ],
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async deleteCompany(id: string): Promise<void> {
    const company = await this.findById(id);
    await this.companyRepo.remove(company);
  }

  async login(
    dto: LoginCompanyDto,
    ip: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const company = await this.findByEmail(dto.email);
    if (!company) throw new UnauthorizedException('Invalid credentials');
    if (!company.isActive) throw new UnauthorizedException('Company not active');
    if (!company.isVerified) throw new UnauthorizedException('Email not verified');

    const isMatch = await company.comparePassword(dto.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const accessToken = this.jwtService.signAccess({
      companyId: company.id,
      role: company.role,
    });

    const refreshToken = this.jwtService.signRefresh({ companyId: company.id });

    await this.tokenRepo.save(this.tokenRepo.create({ refreshToken, company }));

    await this.loginLogRepo.save(
      this.loginLogRepo.create({
        company,
        ip,
        action: 'login',
        success: true,
      }),
    );
    return { accessToken, refreshToken };
  }

  async oauthLogin(provider: 'google' | 'facebook' | 'linkedin', token: string) {
    if (provider === 'google') return this.loginWithGoogle(token);
    if (provider === 'facebook') return this.loginWithFacebook(token);
    if (provider === 'linkedin') return this.loginWithLinkedIn(token);
    throw new BadRequestException('مزود خدمة غير مدعوم');
  }

  private async loginWithGoogle(token: string) {
    const res = await axios.get<{ email: string }>(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`,
    );
    const { email } = res.data;
    if (!email) throw new BadRequestException('Google login failed');
    return this.handleSocialLogin(email, 'google');
  }

  private async loginWithFacebook(accessToken: string) {
    const res = await axios.get<{ email?: string }>(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`,
    );
    const { email } = res.data;
    if (!email) throw new BadRequestException('Facebook login failed');
    return this.handleSocialLogin(email, 'facebook');
  }

  private async loginWithLinkedIn(accessToken: string) {
    const res = await axios.get<{
      elements: Array<{ 'handle~': { emailAddress: string } }>;
    }>(
      'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const email = res.data.elements[0]['handle~'].emailAddress;
    if (!email) throw new BadRequestException('LinkedIn login failed');
    return this.handleSocialLogin(email, 'linkedin');
  }

  private async handleSocialLogin(email: string, provider: string) {
    let company = await this.companyRepo.findOne({ where: { email } });
    if (!company) {
      const newCompany: DeepPartial<Company> = {
        id: uuid(),
        email,
        provider,
        isVerified: true,
        isActive: true,
      };
      company = this.companyRepo.create(newCompany);
      await this.companyRepo.save(company);
    }
    const accessToken = this.jwtService.signAccess({
      companyId: company.id,
      role: company.role,
    });
    const refreshToken = this.jwtService.signRefresh({ companyId: company.id });
    return { accessToken, refreshToken, provider };
  }

  async revokeToken(token: string): Promise<void> {
    await this.tokenRepo.delete({ refreshToken: token });
  }

  async verifyRefreshToken(token: string): Promise<CompanyPayload> {
    try {
      return await this.jwtService.verifyAsync<CompanyPayload>(token);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ خطأ في التحقق من Refresh Token: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async refresh(token: string): Promise<{ accessToken: string }> {
    const payload = await this.verifyRefreshToken(token);
    const accessToken = this.jwtService.signAccess({
      companyId: payload.companyId,
      role: payload.role,
    });
    return { accessToken };
  }

  async logout(refreshToken: string, ip: string, accessToken: string | null): Promise<{ success: boolean }> {
    const existing: CompanyToken | null = await this.tokenRepo.findOne({
      where: { refreshToken },
      relations: ['company'],
    });

    if (!existing) {
      this.logger.warn(` التوكن غير موجود`);
      throw new NotFoundException('Refresh token غير صالح');
    }

    const companyId = existing.company?.id;

    if (!companyId || typeof companyId !== 'string') {
      this.logger.error(` companyId غير موجود أو غير صالح`);
      throw new InternalServerErrorException('فشل استخراج معرف الشركة');
    }

    await this.tokenRepo.remove(existing);

    if (accessToken && accessToken.length > 20) {
      try {
        this.jwtService.verify(accessToken);
        const revoked = this.revokedTokenRepo.create({
          token: accessToken,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        await this.revokedTokenRepo.save(revoked);
      } catch {
        this.logger.warn(` التوكن غير صالح للتسجيل كـ ملغي`);
      }
    }
    await this.loginLogRepo.save({
      company: { id: companyId },
      ip,
      action: 'logout',
      success: true,
    });
    return { success: true };
  }

  async activateSubscription(companyId: string, planId: string, provider: string): Promise<void> {
    await this.companyRepo.update(companyId, {
      subscriptionStatus: 'active',
      subscribedAt: new Date(),
      planId,
      paymentProvider: provider,
    });
  }

  async findAll(): Promise<Company[]> {
    return this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.subscriptions', 'subscription')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .getMany();
  }

  async requestPasswordReset(email: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    company.verificationCode = resetCode;
    await this.companyRepo.save(company);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER ?? '',
        pass: process.env.EMAIL_PASS ?? '',
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: process.env.EMAIL_USER ?? '',
      to: email,
      subject: 'إعادة تعيين كلمة المرور',
      text: `رمز إعادة تعيين كلمة المرور هو: ${resetCode}`,
    };

    try {
      await transporter.sendMail(mailOptions);
      return '✅ تم إرسال كود إعادة تعيين كلمة المرور';
    } catch (err) {
      const errorMessage =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Unknown error';

      this.logger.error(`❌ فشل إرسال البريد: ${errorMessage}`);
      throw new BadRequestException('فشل إرسال البريد الإلكتروني');
    }
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.verificationCode !== code)
      throw new UnauthorizedException('❌ كود غير صحيح');

    company.password = await bcrypt.hash(newPassword, 10);
    company.verificationCode = null;
    await this.companyRepo.save(company);

    return '✅ تم تغيير كلمة المرور بنجاح';
  }
}
