/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
  BadRequestException,
  InternalServerErrorException,
  HttpStatus,
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
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import axios from 'axios';
import { RevokedToken } from './entities/revoked-token.entity';
import { DataSource } from 'typeorm';
import { CloudinaryService } from '../common/services/cloudinary.service';
import sharp from 'sharp';
import { CompanyResponseDto } from './dto/CompanyResponseDto';
import { AuthProvider } from './dto/create-company.dto';
import { ActivityTrackerService } from './service/activity-tracker.service';
import { CompanyActivity } from './entities/company-activity.entity';
import { FileUploadService } from '../common/services/file-upload.service';
import { CompanySubscription, SubscriptionStatus } from '../subscription/entities/company-subscription.entity';

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

    @InjectRepository(CompanyActivity) 
    private readonly activityRepo: Repository<CompanyActivity>,

    @InjectRepository(CompanySubscription)
    private readonly subscriptionRepo: Repository<CompanySubscription>,

    public readonly jwtService: CompanyJwtService,
    private readonly dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
    private readonly activityTracker: ActivityTrackerService,
    private readonly fileUploadService: FileUploadService, 
  ) {}

async syncSubscriptionStatus(companyId: string): Promise<void> {
  try {
    const company = await this.companyRepo.findOne({ 
      where: { id: companyId },
      relations: ['subscriptions', 'subscriptions.plan']    
    });

    if (!company) {
      this.logger.warn(`الشركة غير موجودة: ${companyId}`);
      return;
    }

    const activeSubscription = company.subscriptions?.find(
      sub => sub.status === SubscriptionStatus.ACTIVE
    );

    if (activeSubscription && activeSubscription.plan) {
      if (company.subscriptionStatus !== 'active') {
        await this.companyRepo.update(companyId, {
          subscriptionStatus: 'active',
          planId: activeSubscription.plan.id, 
          subscribedAt: activeSubscription.startDate
        });
        this.logger.log(` تم مزامنة حالة الاشتراك للشركة ${companyId} إلى active`);
      }
    } else {
      if (company.subscriptionStatus === 'active') {
        await this.companyRepo.update(companyId, {
          subscriptionStatus: 'inactive',
          planId: null,
          subscribedAt: null as any 
        });
        this.logger.log(` تم مزامنة حالة الاشتراك للشركة ${companyId} إلى inactive`);
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(` فشل مزامنة حالة الاشتراك للشركة ${companyId}: ${errorMessage}`);
  }
}

  async getActiveSubscription(companyId: string): Promise<CompanySubscription | null> {
    try {
      return await this.subscriptionRepo.findOne({
        where: {
          company: { id: companyId },
          status: SubscriptionStatus.ACTIVE
        },
        relations: ['plan'],
        order: { createdAt: 'DESC' }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل جلب الاشتراك النشط للشركة ${companyId}: ${errorMessage}`);
      return null;
    }
  }

  async recordUserActivity(companyId: string, action: string): Promise<void> {
    try {
      await this.activityTracker.recordActivity(companyId, action);
    } catch (error) {
      this.logger.error(` فشل تسجيل النشاط في CompanyService: ${error}`);
    }
  }

  async shouldLogoutDueToInactivity(companyId: string): Promise<boolean> {
    try {
      const result = await this.activityTracker.checkInactivity(companyId);
      this.logger.debug(` نتيجة التحقق من النشاط للشركة ${companyId}: ${result}`);
      return result;
    } catch (error) {
      this.logger.error(` خطأ في التحقق من النشاط في CompanyService: ${error}`);
      return false; 
    }
  }

  async markUserAsOffline(companyId: string): Promise<void> {
    try {
      await this.activityTracker.markAsOffline(companyId);
      this.logger.log(` تم تسجيل خروج الشركة ${companyId} بسبب عدم النشاط`);
    } catch (error) {
      this.logger.error(` فشل تعيين حالة غير متصل في CompanyService: ${error}`);
    }
  }

  async onModuleInit() {
    await this.seedDefaultCompany();
  }

  async seedDefaultCompany(): Promise<void> {
    const email = 'admin2@company.com';
    const exists = await this.companyRepo.findOne({ where: { email } });
    if (exists) {
      this.logger.warn(`الشركة الافتراضية موجودة بالفعل: ${email}`);
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
    this.logger.log(`تم زرع الشركة الافتراضية: ${email}`);
  }

  async countEmployees(companyId: string): Promise<number> {
    return this.employeeRepo.count({
      where: { company: { id: companyId } },
    });
  }

  async createCompany(dto: CreateCompanyDto, logo?: Express.Multer.File): Promise<Company> {
    const existing = await this.companyRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('هذا البريد مستخدم بالفعل');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const tempId = uuid();
    let logoUrl: string | undefined;

    if (logo) {
      try {
        if (!logo.buffer || !(logo.buffer instanceof Buffer)) {
          throw new BadRequestException('الملف غير صالح أو لا يحتوي على buffer');
        }

        const imageProcessor = sharp(logo.buffer);
        const resized = imageProcessor.resize({ width: 800 });
        const formatted = resized.webp({ quality: 70 });
        const compressedBuffer = await formatted.toBuffer();

        const compressedFile = {
          ...logo,
          buffer: compressedBuffer,
        };

        const result = await this.cloudinaryService.uploadImage(compressedFile, `companies/${tempId}/logo`);
        logoUrl = result.secure_url;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`فشل رفع الشعار على Cloudinary: ${errorMessage}`);
        throw new InternalServerErrorException('فشل رفع صورة الشعار');
      }
    }

    const companyData: DeepPartial<Company> = {
      ...dto,
      password: hashedPassword,
      isVerified: false,
      verificationCode,
      provider: dto.provider || AuthProvider.EMAIL, 
      logoUrl,
      fontFamily: dto.fontFamily ?? 'Cairo, sans-serif', 
      id: tempId,
      subscriptionStatus: 'inactive',
      planId: null,
      phone: dto.phone || '', 
      subscribedAt: undefined,
      paymentProvider: undefined,
    };

    const company = this.companyRepo.create(companyData);
    const saved = await this.companyRepo.save(company);

    try {
      await this.sendVerificationCode(saved.email, verificationCode); 
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل إرسال كود التحقق: ${errorMessage}`);
    }
    return saved;
  }

  async sendVerificationCode(email: string, code: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    company.verificationCode = code;
    await this.companyRepo.save(company);

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailHost || !emailPort || !emailUser || !emailPass) {
      throw new InternalServerErrorException('إعدادات البريد الإلكتروني غير مكتملة');
    }

    this.logger.log(` إعدادات البريد: ${emailHost}:${emailPort} - ${emailUser}`);

    const transportOptions: SMTPTransport.Options = {
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
    };

    if (parseInt(emailPort) === 465) {
      transportOptions.secure = true;
    }

    const transporter = nodemailer.createTransport(transportOptions);
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Sharik SA" <${emailUser}>`, 
      to: email,
      subject: 'رمز التحقق من البريد الإلكتروني',
      text: `كود التفعيل الخاص بك هو: ${code}`,
      html: `
        <div dir="rtl">
          <h2>تفعيل البريد الإلكتروني</h2>
          <p>كود التفعيل الخاص بك هو: <strong>${code}</strong></p>
          <p>شكراً لانضمامك إلى منصتنا</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      this.logger.log(` تم إرسال كود التحقق إلى ${email}`);
      return `تم إرسال كود التحقق إلى ${email}`;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(` فشل إرسال البريد: ${errorMessage}`);
      throw new BadRequestException('فشل إرسال البريد الإلكتروني');
    }
  }

  async verifyCode(email: string, code: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.verificationCode !== code)
      throw new UnauthorizedException('كود غير صحيح');

    company.isVerified = true;
    company.verificationCode = null;
    await this.companyRepo.save(company);

    return 'تم تفعيل البريد الإلكتروني بنجاح';
  }

  async updateCompany(
    id: string, 
    dto: UpdateCompanyDto, 
    logo?: Express.Multer.File,
    customFont?: Express.Multer.File 
  ): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    let logoUrl: string | undefined;
    let customFontUrl: string | undefined;

    if (logo) {
      try {
        if (!logo.buffer || !(logo.buffer instanceof Buffer)) {
          throw new BadRequestException('الملف غير صالح أو لا يحتوي على buffer');
        }

        const imageProcessor = sharp(logo.buffer);
        const resized = imageProcessor.resize({ width: 800 });
        const formatted = resized.webp({ quality: 70 });
        const compressedBuffer = await formatted.toBuffer();

        const compressedFile = {
          ...logo,
          buffer: compressedBuffer,
        };

        const result = await this.cloudinaryService.uploadImage(compressedFile, `companies/${id}/logo`);
        logoUrl = result.secure_url;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(` فشل رفع الشعار على Cloudinary: ${errorMessage}`);
        throw new InternalServerErrorException('فشل رفع صورة الشعار');
      }
    }

    if (customFont) {
      try {
        const fontUploadResult = await this.fileUploadService.uploadFont(customFont, id);
        customFontUrl = fontUploadResult.fileUrl;

        if (company.customFontUrl) {
          await this.fileUploadService.deleteFont(company.customFontUrl);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(` فشل رفع الخط المخصص: ${errorMessage}`);
        throw new InternalServerErrorException('فشل رفع ملف الخط');
      }
    }

    const updateData: Partial<Company> = {
      ...dto,
      logoUrl: logoUrl ?? company.logoUrl,
      fontFamily: dto.fontFamily ?? company.fontFamily,
      customFontUrl: customFontUrl ?? company.customFontUrl, 
      customFontName: dto.customFontName ?? company.customFontName, 
    };

    await this.companyRepo.update(id, updateData);
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
    
    if (!company) {
      throw new BadRequestException('الشركة غير موجودة');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `DELETE FROM payment_proof WHERE "companyId" = $1`,
        [id]
      );

      const relatedTables = [
        'employee',
        'company_subscription', 
        'company_token',
        'company_login_log',
        'revoked_token'
      ];

      for (const table of relatedTables) {
        try {
          await queryRunner.query(
            `DELETE FROM ${table} WHERE "companyId" = $1`,
            [id]
          );
        } catch (tableError: unknown) {
          const errorMessage = this.getErrorMessage(tableError);
          this.logger.warn(` لا يوجد جدول ${table}: ${errorMessage}`);
        }
      }

      await queryRunner.query(`DELETE FROM company WHERE id = $1`, [id]);

      await queryRunner.commitTransaction();
      this.logger.log(` تم حذف الشركة ${id} وجميع بياناتها`);

    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(` فشل حذف الشركة: ${errorMessage}`);
      
      await this.forceDeleteWithCascade(id);
    } finally {
      await queryRunner.release();
    }
  }

  private async forceDeleteWithCascade(id: string): Promise<void> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(`
          ALTER TABLE payment_proof 
          DROP CONSTRAINT IF EXISTS "FK_f91d3a526062aa69c36c3e971cd"
        `);

        await queryRunner.query(`DELETE FROM company WHERE id = $1`, [id]);

        await queryRunner.commitTransaction();
        this.logger.log(` تم حذف الشركة ${id} بعد إزالة الـ constraint`);

      } catch (innerError: unknown) {
        await queryRunner.rollbackTransaction();
        const errorMessage = this.getErrorMessage(innerError);
        throw new Error(errorMessage);
      } finally {
        await queryRunner.release();
      }
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(` فشل جميع محاولات الحذف: ${errorMessage}`);
      throw new InternalServerErrorException('فشل حذف الشركة. يرجى التحقق من قاعدة البيانات يدوياً.');
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  async login(
    dto: LoginCompanyDto,
    ip: string,
  ): Promise<{ 
    statusCode: number;
    message: string;
    data: {
      accessToken: string;
      refreshToken: string;
      company: CompanyResponseDto;
    }
  }> {
    const company = await this.findByEmail(dto.email);
    if (!company) throw new UnauthorizedException('Invalid credentials');
    if (!company.isActive) throw new UnauthorizedException('Company not active');
    if (!company.isVerified) throw new UnauthorizedException('Email not verified');

    const isMatch = await company.comparePassword(dto.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    // ✅ مزامنة حالة الاشتراك عند تسجيل الدخول
    await this.syncSubscriptionStatus(company.id);

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

    await this.activityTracker.markAsOnline(company.id);
    await this.recordUserActivity(company.id, 'login');

    const companyResponse: CompanyResponseDto = {
      id: company.id,
      name: company.name,
      email: company.email,
      phone: company.phone,
      logoUrl: company.logoUrl,
      description: company.description,
      subscriptionStatus: company.subscriptionStatus,
      fontFamily: company.fontFamily,
      isActive: company.isActive,
      isVerified: company.isVerified,
      provider: company.provider,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'تم تسجيل الدخول بنجاح',
      data: {
        accessToken: accessToken,
        refreshToken: refreshToken, 
        company: companyResponse
      },
    };
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
    
    // ✅ مزامنة حالة الاشتراك عند تسجيل الدخول الاجتماعي
    await this.syncSubscriptionStatus(company.id);
    
    await this.activityTracker.markAsOnline(company.id);
    await this.recordUserActivity(company.id, `social-login:${provider}`);
    
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
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(` خطأ في التحقق من Refresh Token: ${errorMessage}`);
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
      this.logger.warn(` التوكن غير موجود في عملية تسجيل الخروج`);
      throw new NotFoundException('Refresh token غير صالح');
    }

    const companyId = existing.company?.id;

    if (!companyId || typeof companyId !== 'string') {
      this.logger.error(` companyId غير موجود أو غير صالح في عملية تسجيل الخروج`);
      throw new InternalServerErrorException('فشل استخراج معرف الشركة');
    }

    await this.tokenRepo.remove(existing);

    await this.markUserAsOffline(companyId);

    if (accessToken && accessToken.length > 20) {
      try {
        this.jwtService.verify(accessToken);
        const revoked = this.revokedTokenRepo.create({
          token: accessToken,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        await this.revokedTokenRepo.save(revoked);
        this.logger.debug(`تم إلغاء توكن الوصول للشركة ${companyId}`);
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

    this.logger.log(` تم تسجيل خروج الشركة ${companyId} بنجاح`);
    
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

  async resetPassword(email: string, code: string, newPassword: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');
    if (company.verificationCode !== code)
      throw new UnauthorizedException('كود غير صحيح');

    company.password = await bcrypt.hash(newPassword, 10);
    company.verificationCode = null;
    await this.companyRepo.save(company);

    return 'تم تغيير كلمة المرور بنجاح';
  }
  
  async requestPasswordReset(email: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { email } });
    if (!company) throw new NotFoundException('Company not found');

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    company.verificationCode = resetCode;
    await this.companyRepo.save(company);

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailHost || !emailPort || !emailUser || !emailPass) {
      throw new InternalServerErrorException('إعدادات البريد الإلكتروني غير مكتملة');
    }

    this.logger.log(` إعدادات البريد: ${emailHost}:${emailPort} - ${emailUser}`);

    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: parseInt(emailPort),
      secure: parseInt(emailPort) === 465, 
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"info@sharik-sa.com" <${emailUser}>`, 
      to: email,
      subject: 'إعادة تعيين كلمة المرور',
      text: `رمز إعادة تعيين كلمة المرور هو: ${resetCode}`,
      html: `
        <div dir="rtl">
          <h2>إعادة تعيين كلمة المرور</h2>
          <p>رمز إعادة تعيين كلمة المرور هو: <strong>${resetCode}</strong></p>
          <p>إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      this.logger.log(` تم إرسال كود إعادة تعيين كلمة المرور إلى ${email}`);
      return 'تم إرسال كود إعادة تعيين كلمة المرور';
    } catch (err: unknown) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(` فشل إرسال البريد: ${errorMessage}`);
      throw new BadRequestException('فشل إرسال البريد الإلكتروني');
    }
  }

  async getCompanyLogo(companyId: string): Promise<{ 
    logoUrl: string | null; 
    companyId: string; 
    companyName: string;}> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      select: ['id', 'name', 'logoUrl'] 
    });

    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    return {
      logoUrl: company.logoUrl,
      companyId: company.id,
      companyName: company.name
    };
  }

  async getCompanyFont(companyId: string): Promise<{
    fontFamily: string;
    customFontUrl: string | null;
    customFontName: string | null;
    fontCss: string;
  }> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('الشركة غير موجودة');
    }

    const fontCss = this.generateFontCss(company);

    return {
      fontFamily: company.fontFamily,
      customFontUrl: company.customFontUrl,
      customFontName: company.customFontName,
      fontCss: fontCss
    };
  }

  private generateFontCss(company: Company): string {
    if (company.customFontUrl && company.customFontName) {
      const fontUrl = `http://localhost:3000${company.customFontUrl}`;
      
      return `
        @font-face {
          font-family: '${company.customFontName}';
          src: url('${fontUrl}') format('woff2');
          font-display: swap;
          font-weight: normal;
          font-style: normal;
        }
      `;
    }
    return '';
  }

  async deleteCustomFont(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    if (company.customFontUrl) {
      try {
        await this.fileUploadService.deleteFont(company.customFontUrl);
      } catch (error) {
        this.logger.error(` فشل حذف الخط من التخزين: ${error}`);
      }
    }

    await this.companyRepo.update(companyId, {
      customFontUrl: undefined, 
      customFontName: undefined, 
      fontFamily: 'Cairo, sans-serif'
    });
  }
}