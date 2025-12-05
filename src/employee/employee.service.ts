/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-base-to-string */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeCard } from './entities/employee-card.entity';
import { EmployeeImage } from './entities/EmployeeImage.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Company } from '../company/entities/company.entity';
import { SubscriptionService } from '../subscription/subscription.service';
import { VisitService } from '../visit/visit.service';
import { CardService } from '../card/card.service';
import { Request } from 'express';
import * as ExcelJS from 'exceljs';
import * as jwt from 'jsonwebtoken';
import { createEmployeePass } from '../wallet/passkit.adapter';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { randomUUID } from 'crypto';
import { SubscriptionStatus } from '../subscription/entities/company-subscription.entity';

type VideoType = 'youtube' | 'vimeo';
type ContactFormDisplayType = 'overlay' | 'inline';
type ContactFieldType = 'email' | 'phone' | 'one-line' | 'multi-line';
type FeedbackIconType = 'star' | 'heart' | 'thumb' | 'smile';

const allowedVideoTypes: VideoType[] = ['youtube', 'vimeo'];
const allowedContactFormDisplayTypes: ContactFormDisplayType[] = ['overlay', 'inline'];
const allowedContactFieldTypes: ContactFieldType[] = ['email', 'phone', 'one-line', 'multi-line'];
const allowedFeedbackIconTypes: FeedbackIconType[] = ['star', 'heart', 'thumb', 'smile'];

type EmployeeImageType = {
  imageUrl: string;
  label?: string;
  publicId?: string;
};

interface FileUploadResult {
  secure_url: string;
  public_id: string;
}

const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);
  private readonly baseUploadsDir = path.join(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(EmployeeCard) private readonly cardRepo: Repository<EmployeeCard>,
    @InjectRepository(EmployeeImage) private readonly imageRepo: Repository<EmployeeImage>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly subscriptionService: SubscriptionService,
    private readonly visitService: VisitService,
    private readonly cardService: CardService,
  ) {}

  private safeToString(value: unknown): string {
    if (value === null || value === undefined) return 'NULL/UNDEFINED';
    if (typeof value === 'string') {
      return value === '' ? 'EMPTY_STRING' : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
    if (typeof value === 'object') {
      try {
        if (Object.keys(value).length === 0) return 'EMPTY_OBJECT';
        return JSON.stringify(value);
      } catch {
        return '[OBJECT]';
      }
    }
    try {
      return value.toString();
    } catch {
      return '[UNSTRINGIFIABLE]';
    }
  }

  private normalizeUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string' || url.trim() === '') {
      return null;
    }

    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
      return trimmedUrl;
    }
  
    if (trimmedUrl.startsWith('www.')) {
      return `https://${trimmedUrl}`;
    }
  
    if (trimmedUrl.startsWith('//')) {
      return `https:${trimmedUrl}`;
    }
    return `https://${trimmedUrl}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private async uploadImageToLocal(
    file: Express.Multer.File,
    companyId: string,
    subFolder: string = 'images'
  ): Promise<FileUploadResult> {
    try {
      const companyDir = path.join(this.baseUploadsDir, companyId);
      const targetDir = path.join(companyDir, subFolder);
      
      ensureDirectoryExists(targetDir);
      
      const compressedBuffer = await sharp(file.buffer, { failOnError: false })
        .resize({ width: 800 })
        .webp({ quality: 70 })
        .toBuffer();
      
      const fileExtension = '.webp';
      const uniqueFileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${fileExtension}`;
      const filePath = path.join(targetDir, uniqueFileName);
      
      await fsPromises.writeFile(filePath, compressedBuffer);
      
      const fileUrl = `/uploads/${companyId}/${subFolder}/${uniqueFileName}`;
      
      this.logger.log(`تم رفع الصورة محلياً: ${fileUrl}`);
      
      return {
        secure_url: fileUrl,
        public_id: uniqueFileName
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل رفع الصورة محلياً: ${errorMessage}`);
      throw new Error(`فشل رفع الصورة: ${errorMessage}`);
    }
  }

  private async uploadPdfToLocal(
    file: Express.Multer.File,
    companyId: string,
    employeeId: number
  ): Promise<FileUploadResult> {
    try {
      const companyDir = path.join(this.baseUploadsDir, companyId);
      const pdfsDir = path.join(companyDir, 'pdfs');
      
      ensureDirectoryExists(pdfsDir);
      
      const fileExtension = path.extname(file.originalname);
      const uniqueFileName = `pdf_${Date.now()}_${employeeId}_${Math.random().toString(36).substring(2, 9)}${fileExtension}`;
      const filePath = path.join(pdfsDir, uniqueFileName);
      
      await fsPromises.writeFile(filePath, file.buffer);
      
      const fileUrl = `/uploads/${companyId}/pdfs/${uniqueFileName}`;
      
      this.logger.log(`تم رفع PDF محلياً: ${fileUrl}`);
      
      return {
        secure_url: fileUrl,
        public_id: uniqueFileName
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل رفع PDF محلياً: ${errorMessage}`);
      throw new Error(`فشل رفع PDF: ${errorMessage}`);
    }
  }

  private validateFileType(file: Express.Multer.File): boolean {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedPdfTypes = ['application/pdf'];
    const allowedTypes = [...allowedImageTypes, ...allowedPdfTypes];
    
    return allowedTypes.includes(file.mimetype);
  }

  private validateFileSize(file: Express.Multer.File, maxSizeMB = 3): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }

  async create(dto: CreateEmployeeDto, companyId: string, files: Express.Multer.File[]) {
    this.logger.log('بدء إنشاء موظف جديد');
    this.logger.log(`companyId: ${companyId}`);
    this.logger.log(`البيانات المستلمة من DTO:`);
  
    Object.keys(dto).forEach(key => {
      const value = dto[key as keyof CreateEmployeeDto];
      if (value === null || value === undefined || value === '') {
        this.logger.warn(`  ${key}: NULL/EMPTY`);
      } else {
        this.logger.log(` ${key}: ${this.safeToString(value)}`);
      }
    });

    this.logger.log(`الملفات المستلمة: ${files?.length || 0} ملف`);
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        this.logger.log(`    ملف ${index + 1}: ${file.fieldname} - ${file.originalname} - ${file.size} bytes`);
      });
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      this.logger.error(`الشركة غير موجودة: ${companyId}`);
      throw new NotFoundException('Company not found');
    }
  
    const { canAdd, allowed, current, maxAllowed } = await this.subscriptionService.canAddEmployee(companyId);
    if (!canAdd) {
      this.logger.error(`الشركة ${companyId} حاولت إضافة موظف بدون اشتراك نشط أو تجاوز الحد`);
      throw new ForbiddenException(`الخطة لا تسمح بإضافة موظفين جدد - تم الوصول للحد الأقصى (${current}/${maxAllowed}) - يرجى ترقية الخطة`);
    }
  
    const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
    if (allowedCount.remaining <= 0) {
      this.logger.error(`الشركة ${companyId} حاولت إضافة موظف بدون اشتراك نشط أو تجاوز الحد`);
      throw new ForbiddenException('الخطة لا تسمح بإضافة موظفين جدد - يرجى تجديد الاشتراك');
    }

    let workingHours: Record<string, { from: string; to: string }> | null = null;
    let isOpen24Hours = false;
    let showWorkingHours = dto.showWorkingHours ?? false;

    if (showWorkingHours) {
      if (dto.isOpen24Hours) {
        isOpen24Hours = true;
      } else if (dto.workingHours && Object.keys(dto.workingHours).length > 0) {
        workingHours = dto.workingHours;
      } else {
        showWorkingHours = false;
      }
    }

    const employeeData: Partial<Employee> = {
      ...dto,
      company,
      showWorkingHours,
      isOpen24Hours,
      workingHours,
      cardStyleSection: dto.cardStyleSection ?? false,
      videoType: allowedVideoTypes.includes(dto.videoType as VideoType)
        ? (dto.videoType as VideoType)
        : undefined,
      contactFormDisplayType: allowedContactFormDisplayTypes.includes(dto.contactFormDisplayType as ContactFormDisplayType)
        ? (dto.contactFormDisplayType as ContactFormDisplayType)
        : undefined,
      contactFieldType: allowedContactFieldTypes.includes(dto.contactFieldType as ContactFieldType)
        ? (dto.contactFieldType as ContactFieldType)
        : undefined,
      feedbackIconType: allowedFeedbackIconTypes.includes(dto.feedbackIconType as FeedbackIconType)
        ? (dto.feedbackIconType as FeedbackIconType)
        : undefined,
    };

    const normalizeUrl = (url: string | null | undefined): string | null => {
      if (!url || typeof url !== 'string' || url.trim() === '') {
        return null;
      }

      const trimmedUrl = url.trim();
    
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        return trimmedUrl;
      }
    
      if (trimmedUrl.startsWith('www.')) {
        return `https://${trimmedUrl}`;
      }
    
      if (trimmedUrl.startsWith('//')) {
        return `https:${trimmedUrl}`;
      }
    
      return `https://${trimmedUrl}`;
    };

    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    const workLinkFields = [
      'workLink', 'workLinkk', 'workLinkkk', 'workLinkkkk', 'workLinkkkkk',
      'buttonLink', 'highRatingRedirectUrl', 'conGoogleMapUrl', 'videoUrl'
    ] as const;

    workLinkFields.forEach(field => {
      if (employeeData[field as keyof typeof employeeData]) {
        const value = employeeData[field as keyof typeof employeeData] as string;
        const normalizedUrl = normalizeUrl(value);
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          employeeData[field as keyof typeof employeeData] = normalizedUrl as any;
          this.logger.log(`  تم تحويل ${field}: ${value} → ${normalizedUrl}`);
        } else if (normalizedUrl) {
          this.logger.warn(`  الرابط غير صالح في ${field}: ${value}`);
          employeeData[field as keyof typeof employeeData] = null as any;
        }
      }
    });

    const socialFields = [
      'facebook', 'instagram', 'tiktok', 'snapchat', 'x', 'linkedin',
      'wechat'
    ] as const;

    socialFields.forEach(field => {
      if (employeeData[field as keyof typeof employeeData]) {
        const value = employeeData[field as keyof typeof employeeData] as string;
        const normalizedUrl = normalizeUrl(value);
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          employeeData[field as keyof typeof employeeData] = normalizedUrl as any;
          this.logger.log(`  تم تحويل ${field}: ${value} → ${normalizedUrl}`);
        } else if (normalizedUrl) {
          this.logger.warn(`  الرابط غير صالح في ${field}: ${value}`);
          employeeData[field as keyof typeof employeeData] = null as any;
        }
      }
    });

    this.logger.log('بيانات الموظف قبل الحفظ:');
    const employeeDataForLog = {
      name: employeeData.name,
      email: employeeData.email,
      jobTitle: employeeData.jobTitle,
      phone: employeeData.phone,
      showWorkingHours: employeeData.showWorkingHours,
      isOpen24Hours: employeeData.isOpen24Hours,
      workingHours: employeeData.workingHours,
      workLink: employeeData.workLink,
      workLinkkkk: employeeData.workLinkkkk,
      facebook: employeeData.facebook,
    };
  
    Object.keys(employeeDataForLog).forEach(key => {
      const value = employeeDataForLog[key as keyof typeof employeeDataForLog];
      if (value === null || value === undefined || value === '') {
        this.logger.warn(`  ${key}: NULL/EMPTY في البيانات النهائية`);
      } else {
        this.logger.log(` ${key}: ${this.safeToString(value)}`);
      }
    });

    const employee = this.employeeRepo.create(employeeData);
    let saved = await this.employeeRepo.save(employee);

    this.logger.log(`تم إنشاء الموظف بنجاح - ID: ${saved.id}`);
    this.logger.log(`البيانات المحفوظة فعلياً:`);
    this.logger.log(`    ID: ${saved.id}`);
    this.logger.log(`    Name: ${saved.name}`);
    this.logger.log(`    Email: ${saved.email || 'NULL'}`);
    this.logger.log(`    Job Title: ${saved.jobTitle || 'NULL'}`);
    this.logger.log(`    Phone: ${saved.phone || 'NULL'}`);
    this.logger.log(`    Profile Image: ${saved.profileImageUrl || 'NULL'}`);
    this.logger.log(`    workLinkkkk: ${saved.workLinkkkk || 'NULL'}`);
    this.logger.log(`    workLinkkkkk: ${saved.workLinkkkkk || 'NULL'}`);

    type ImageMapType = {
      profileImageUrl: 'profileImageUrl';
      secondaryImageUrl: 'secondaryImageUrl';
      logoUrl: 'logoUrl';
      facebookImageUrl: 'facebookImageUrl';
      instagramImageUrl: 'instagramImageUrl';
      tiktokImageUrl: 'tiktokImageUrl';
      snapchatImageUrl: 'snapchatImageUrl';
      xImageUrl: 'xImageUrl';
      linkedinImageUrl: 'linkedinImageUrl';
      customImageUrl: 'customImageUrl';
      testimonialImageUrl: 'testimonialImageUrl';
      workingHoursImageUrl: 'workingHoursImageUrl';
      contactFormHeaderImageUrl: 'contactFormHeaderImageUrl';
      pdfThumbnailUrl: 'pdfThumbnailUrl';
      pdfFile: 'pdfFileUrl';
      pdfFileUrl: 'pdfFileUrl';
      workLinkImageUrl: 'workLinkImageUrl';
      workLinkkImageUrl: 'workLinkkImageUrl';
      workLinkkkImageUrl: 'workLinkkkImageUrl';
      workLinkkkkImageUrl: 'workLinkkkkImageUrl';
      workLinkkkkkImageUrl: 'workLinkkkkkImageUrl';
      backgroundImageUrl: 'backgroundImage';
    };

    const imageMap: ImageMapType = {
      'profileImageUrl': 'profileImageUrl',
      'secondaryImageUrl': 'secondaryImageUrl',
      'logoUrl': 'logoUrl',
      'facebookImageUrl': 'facebookImageUrl',
      'instagramImageUrl': 'instagramImageUrl', 
      'tiktokImageUrl': 'tiktokImageUrl',
      'snapchatImageUrl': 'snapchatImageUrl',
      'xImageUrl': 'xImageUrl',
      'linkedinImageUrl': 'linkedinImageUrl',
      'customImageUrl': 'customImageUrl',
      'testimonialImageUrl': 'testimonialImageUrl',
      'workingHoursImageUrl': 'workingHoursImageUrl',
      'contactFormHeaderImageUrl': 'contactFormHeaderImageUrl',
      'pdfThumbnailUrl': 'pdfThumbnailUrl',
      'pdfFile': 'pdfFileUrl', 
      'pdfFileUrl': 'pdfFileUrl', 
      'workLinkImageUrl': 'workLinkImageUrl',
      'workLinkkImageUrl': 'workLinkkImageUrl',
      'workLinkkkImageUrl': 'workLinkkkImageUrl',
      'workLinkkkkImageUrl': 'workLinkkkkImageUrl',
      'workLinkkkkkImageUrl': 'workLinkkkkkImageUrl',
      'backgroundImageUrl': 'backgroundImage',
    } as const;

    files = Array.isArray(files) ? files : [];
    const validFiles = files.filter(file => file && file.buffer instanceof Buffer);

    const hasPdfFile = validFiles.some(file => 
      (file.fieldname === 'pdfFileUrl' || file.fieldname === 'pdfFile') && 
      file.originalname.toLowerCase().endsWith('.pdf')
    );

    if (!hasPdfFile) {
      this.logger.warn(`لم يتم إرسال ملف PDF في حقل pdfFile أو pdfFileUrl`);
    }

    function chunkArray<T>(array: T[], size: number): T[][] {
      const result: T[][] = [];
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }
      return result;
    }

    const batches = chunkArray(validFiles, 2);
    let backgroundImageUrl: string | null = null;
    let uploadedImagesCount = 0;

    this.logger.log(`بدء رفع ${validFiles.length} ملف`);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.log(`معالجة باتش ${batchIndex + 1} من ${batches.length} (${batch.length} ملف)`);

      await Promise.allSettled(
        batch.map(async (file, fileIndex) => {
          try {
            if (!this.validateFileType(file)) {
              throw new BadRequestException(`نوع الملف غير مدعوم: ${file.mimetype}`);
            }

            if (!this.validateFileSize(file)) {
              throw new BadRequestException('الملف أكبر من 3MB');
            }

            let result: { secure_url: string; public_id: string };
            if (file.originalname.toLowerCase().endsWith('.pdf')) {
              this.logger.log(`رفع ملف PDF: ${file.originalname}`);
              result = await this.uploadPdfToLocal(file, companyId, saved.id);
              this.logger.log(`تم رفع PDF: ${result.secure_url}`);
            } else {
              this.logger.log(`رفع صورة: ${file.originalname}`);
              result = await this.uploadImageToLocal(file, companyId, 'images');
              this.logger.log(`تم رفع الصورة: ${result.secure_url}`);
            }

            const fieldName = file.fieldname as keyof ImageMapType;
            const field = imageMap[fieldName];

            if (field) {
              if (field === 'backgroundImage') {
                backgroundImageUrl = result.secure_url;
                this.logger.log(`تم تعيين صورة الخلفية: ${backgroundImageUrl}`);
              } else {
                const updateData: Partial<Employee> = { [field]: result.secure_url };
                await this.employeeRepo.update(saved.id, updateData);
                (saved as any)[field] = result.secure_url;
                uploadedImagesCount++;
                this.logger.log(`تم تحديث حقل ${field}: ${result.secure_url}`);
              }
            } else {
              const label = typeof file.originalname === 'string'
                ? file.originalname.split('.')[0]
                : 'file';
              const imageEntity = this.imageRepo.create({
                imageUrl: result.secure_url,
                publicId: result.public_id,
                label,
                employee: saved,
              });
              await this.imageRepo.save(imageEntity);
              uploadedImagesCount++;
              this.logger.log(`تم حفظ صورة إضافية: ${result.secure_url}`);
            }

          } catch (error: unknown) {
            const errMsg = error instanceof Error && typeof error.message === 'string'
              ? error.message
              : 'Unknown error';
            const fileName = typeof file.originalname === 'string' ? file.originalname : 'غير معروف';
            this.logger.error(`فشل رفع ملف ${fileName}: ${errMsg}`);
          }
        })
      );
    }

    if (!saved.profileImageUrl) {
      saved.profileImageUrl = '/uploads/default/default-profile.jpg';
      await this.employeeRepo.update(saved.id, { profileImageUrl: saved.profileImageUrl });
      this.logger.log(`تم تعيين الصورة الافتراضية: ${saved.profileImageUrl}`);
      
      const defaultDir = path.join(this.baseUploadsDir, 'default');
      ensureDirectoryExists(defaultDir);
    }

    this.logger.log(`بدء إنشاء بطاقة الموظف`);
    const cardResult = await this.cardService.generateCard(saved, dto.designId, dto.qrStyle, {
      fontColorHead: dto.fontColorHead,
      fontColorHead2: dto.fontColorHead2,
      fontColorParagraph: dto.fontColorParagraph,
      fontColorExtra: dto.fontColorExtra,
      sectionBackground: dto.sectionBackground,
      Background: dto.Background,
      sectionBackground2: dto.sectionBackground2,
      dropShadow: dto.dropShadow,
      shadowX: dto.shadowX,
      shadowY: dto.shadowY,
      shadowBlur: dto.shadowBlur,
      shadowSpread: dto.shadowSpread,
      cardRadius: dto.cardRadius,
      cardStyleSection: dto.cardStyleSection,
      backgroundImage: backgroundImageUrl,
    });

    saved.cardUrl = cardResult.cardUrl;
    saved.designId = cardResult.designId;
    saved.qrCode = cardResult.qrCode;
    
    saved = await this.employeeRepo.save(saved);

    return {
      statusCode: HttpStatus.CREATED,
      message: 'تم إنشاء الموظف بنجاح',
      data: { ...saved, qrCode: cardResult.qrCode },
    };
  }

  async findAll(companyId: string, page = 1, limit = 10, search?: string) {
    const query = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.cards', 'card')
      .leftJoinAndSelect('employee.images', 'image')
      .where('employee.companyId = :companyId', { companyId });
    
    if (search) {
      query.andWhere('employee.name ILIKE :search OR employee.email ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (limit > 0) {
      query.skip((page - 1) * limit).take(limit);
    }

    const [employees, total] = await query.getManyAndCount();
    const data = await Promise.all(
      employees.map(async (emp) => ({
        ...emp,
        qrCode: emp.cards?.[0]?.qrCode || '',
        visitsCount: await this.visitService.getVisitCount(emp.id),
      })),
    );
    
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب الموظفين بنجاح',
      data,
      meta: {
        total,
        page,
        limit,
        pages: limit > 0 ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async findOne(id: number) {
    const employee = await this.employeeRepo.findOne({
      where: { id },
      relations: ['company', 'cards', 'images'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب بيانات الموظف بنجاح',
      data: employee,
    };
  }

  async generateGoogleWalletLink(employeeId: number): Promise<{ url: string; saveLink: string }> {
    try {
      const employee = await this.employeeRepo.findOne({
        where: { id: employeeId },
        relations: ['company'],
      });

      if (!employee) {
        throw new NotFoundException('الموظف غير موجود');
      }

      if (
        !process.env.GOOGLE_ISSUER_ID ||
        !process.env.GOOGLE_PRIVATE_KEY ||
        !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      ) {
        throw new Error('إعدادات Google Wallet غير مكتملة');
      }

      const privateKey = process.env.GOOGLE_PRIVATE_KEY.includes('\\n')
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').trim()
        : process.env.GOOGLE_PRIVATE_KEY.trim();

      const genericObject = {
        id: `${process.env.GOOGLE_ISSUER_ID}.${employeeId}.${Date.now()}`,
        classId: `${process.env.GOOGLE_ISSUER_ID}.generic_card`,
        state: 'active',
        heroImage: {
          sourceUri: {
            uri: employee.cardUrl || 'https://sharke1.netlify.app/default-card.png',
          },
          contentDescription: {
            defaultValue: {
              value: 'بطاقة عمل رقمية',
            },
          },
        },
        textModulesData: [
          {
            header: 'الاسم',
            body: employee.name || 'موظف',
          },
          {
            header: 'المسمى الوظيفي',
            body: employee.jobTitle || 'موظف',
          },
          {
            header: 'البريد الإلكتروني',
            body: employee.email || '',
          },
          {
            header: 'رقم الهاتف',
            body: employee.phone || '',
          },
        ],
        linksModuleData: {
          uris: [
            {
              uri: 'https://sharke1.netlify.app',
              description: 'عرض البطاقة',
            },
          ],
        },
      };

      const jwtPayload = {
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        aud: 'google',
        typ: 'savetowallet',
        origins: ['https://sharke1.netlify.app'],
        payload: {
          genericObjects: [genericObject],
        },
      };

      const token = jwt.sign(jwtPayload, privateKey, {
        algorithm: 'RS256',
      });

      const saveLink = `https://pay.google.com/gp/v/save/${token}`;

      employee.googleWalletUrl = saveLink;
      await this.employeeRepo.save(employee);

      this.logger.log('تم إنشاء رابط Google Wallet');

      return {
        url: `${process.env.API_BASE_URL}/employee/${employeeId}/google-wallet/redirect`,
        saveLink: saveLink,
      };
    } catch (error) {
      this.logger.error(`فشل إنشاء رابط Google Wallet: ${error.message}`);
      throw new Error(`فشل إنشاء رابط Google Wallet: ${error.message}`);
    }
  }

  async generateAppleWalletPass(employeeId: number): Promise<{ buffer: Buffer; fileName: string }> {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      relations: ['company'],
    });

    if (!employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    const stream = await createEmployeePass({
      employeeId: employee.id,
      employeeName: employee.name,
      companyName: employee.company?.name || 'شركة',
      jobTitle: employee.jobTitle || 'موظف',
      email: employee.email,
      phone: employee.phone,
      qrCode: employee.qrCode,
      cardUrl: employee.cardUrl,
    });

    if (!stream || typeof stream.on !== 'function') {
      throw new Error('فشل في إنشاء بطاقة Apple Wallet');
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    const fileName = `business_card_${employee.id}.pkpass`;
    
    employee.appleWalletUrl = `${process.env.API_BASE_URL}/employees/${employeeId}/apple-wallet`;
    await this.employeeRepo.save(employee);

    return { buffer, fileName };
  }

  async getEmployeeForWallet(employeeId: number) {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      relations: ['company'],
      select: ['id', 'name', 'jobTitle', 'email', 'phone', 'qrCode', 'cardUrl', 'company']
    });

    if (!employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    return {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      email: employee.email,
      phone: employee.phone,
      company: employee.company?.name,
      qrCode: employee.qrCode,
      cardUrl: employee.cardUrl,
      googleWalletUrl: employee.googleWalletUrl,
      appleWalletUrl: employee.appleWalletUrl,
    };
  }
 
  private async ensureEmployeeCardExists(employeeId: number): Promise<EmployeeCard> {
    let card = await this.cardRepo.findOne({ 
      where: { employeeId: employeeId }
    });
    
    if (!card) {
      card = this.cardRepo.create({
        employeeId: employeeId,
        title: `بطاقة الموظف ${employeeId}`,
        uniqueUrl: randomUUID(),
        designId: 'default',
        qrStyle: 1,
        qrCode: '',
        fontColorHead: '#000000',
        fontColorHead2: '#000000',
        fontColorParagraph: '#000000',
        fontColorExtra: '#000000',
        sectionBackground: '#ffffff',
        Background: '#ffffff',
        sectionBackground2: '#ffffff',
        dropShadow: '#000000',
        shadowX: 1,
        shadowY: 1,
        shadowBlur: 3,
        shadowSpread: 1,
        cardRadius: 16,
        cardStyleSection: false,
        backgroundImage: null,
      });
      card = await this.cardRepo.save(card);
    }
    
    return card;
  }

  async update(
    id: number, 
    dto: UpdateEmployeeDto, 
    companyId: string, 
    files?: Express.Multer.File[]
  ) {
    if (dto.images !== undefined) {
      await this.handleImagesUpdate(id, dto.images);
    }

    const employee = await this.employeeRepo.findOne({
      where: { id, company: { id: companyId } },
      relations: ['company', 'cards', 'images']
    });

    if (!employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    await this.ensureEmployeeCardExists(employee.id);
    const { images, backgroundImage, ...updateData } = dto;

    const normalizeUrl = (url: string | null | undefined): string | null => {
      if (!url || typeof url !== 'string' || url.trim() === '') {
        return null;
      }

      const trimmedUrl = url.trim();
    
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        return trimmedUrl;
      }
    
      if (trimmedUrl.startsWith('www.')) {
        return `https://${trimmedUrl}`;
      }
    
      if (trimmedUrl.startsWith('//')) {
        return `https:${trimmedUrl}`;
      }
    
      return `https://${trimmedUrl}`;
    };

    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    const workLinkFields = [
      'workLink', 'workLinkk', 'workLinkkk', 'workLinkkkk', 'workLinkkkkk',
      'buttonLink', 'highRatingRedirectUrl', 'conGoogleMapUrl', 'videoUrl'
    ] as const;

    const socialFields = [
      'facebook', 'instagram', 'tiktok', 'snapchat', 'x', 'linkedin',
      'whatsapp', 'wechat'
    ] as const;

    const allLinkFields = [...workLinkFields, ...socialFields] as const;
    const linkUpdates: Record<string, string | null | undefined> = {};

    allLinkFields.forEach(field => {
      const fieldKey = field as string;
      if (updateData[fieldKey as keyof typeof updateData]) {
        const value = updateData[fieldKey as keyof typeof updateData] as string;
        const normalizedUrl = normalizeUrl(value);
        if (normalizedUrl && isValidUrl(normalizedUrl)) {
          linkUpdates[fieldKey] = normalizedUrl;
          this.logger.log(`  تم تحويل ${fieldKey} في التحديث: ${value} → ${normalizedUrl}`);
        } else if (normalizedUrl) {
          this.logger.warn(`  الرابط غير صالح في ${fieldKey} أثناء التحديث: ${value}`);
          linkUpdates[fieldKey] = null;
        }
      }
    });

    Object.assign(employee, linkUpdates);

    Object.keys(linkUpdates).forEach(key => {
      delete updateData[key as keyof typeof updateData];
    });
  
    Object.assign(employee, updateData);

    let savedEmployee = await this.employeeRepo.save(employee);

    let backgroundImageUrl: string | null = null;
    let updatedFileFields: string[] = [];

    if (files && files.length > 0) {
      const result = await this.handleEmployeeFiles(savedEmployee, files);
      backgroundImageUrl = result.backgroundImageUrl;
      updatedFileFields = result.updatedFields;
    }

    if (!savedEmployee.profileImageUrl) {
      savedEmployee.profileImageUrl = '/uploads/default/default-profile.jpg';
      savedEmployee = await this.employeeRepo.save(savedEmployee);
    }

    const designFields: (keyof UpdateEmployeeDto)[] = [
      'name', 'jobTitle', 'designId', 'qrStyle',
      'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',    
      'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
      'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 'cardStyleSection'
    ];

    const hasDesignChanges = designFields.some(field => dto[field] !== undefined);
    const hasBackgroundImageUpdate = updatedFileFields.includes('backgroundImage');
    const hasBackgroundImageInDto = backgroundImage !== undefined;
    const hasFiles = Boolean(files && files.length > 0);
    const isCardUpdated = hasDesignChanges || hasBackgroundImageUpdate || hasBackgroundImageInDto || hasFiles;

    if (isCardUpdated) {
      try {
        const currentCard = await this.cardRepo.findOne({ 
          where: { employeeId: savedEmployee.id } 
        });
    
        let finalBackgroundImage: string | null;
        if (hasBackgroundImageUpdate) {
          finalBackgroundImage = backgroundImageUrl;
        } else if (hasBackgroundImageInDto) {
          finalBackgroundImage = backgroundImage;
        } else if (currentCard?.backgroundImage) {
          finalBackgroundImage = currentCard.backgroundImage;
        } else {
          finalBackgroundImage = null;
        }

        const cardResult = await this.cardService.generateCard(
          savedEmployee,
          dto.designId || savedEmployee.designId,
          dto.qrStyle ?? savedEmployee.qrStyle,
          {
            fontColorHead: dto.fontColorHead,
            fontColorHead2: dto.fontColorHead2,
            fontColorParagraph: dto.fontColorParagraph,
            fontColorExtra: dto.fontColorExtra,
            sectionBackground: dto.sectionBackground,
            Background: dto.Background,
            sectionBackground2: dto.sectionBackground2,
            dropShadow: dto.dropShadow,
            shadowX: dto.shadowX,
            shadowY: dto.shadowY,
            shadowBlur: dto.shadowBlur,
            shadowSpread: dto.shadowSpread,
            cardRadius: dto.cardRadius,
            cardStyleSection: dto.cardStyleSection ?? savedEmployee.cardStyleSection,
            backgroundImage: finalBackgroundImage,
          }
        );
        
        const employeeUpdateData: Record<string, any> = {};

        if (cardResult.cardUrl) employeeUpdateData.cardUrl = cardResult.cardUrl;
        if (cardResult.designId) employeeUpdateData.designId = cardResult.designId;
        if (cardResult.qrCode) employeeUpdateData.qrCode = cardResult.qrCode;
        if (dto.shadowX !== undefined) employeeUpdateData.shadowX = dto.shadowX;
        if (dto.shadowY !== undefined) employeeUpdateData.shadowY = dto.shadowY;      
        if (dto.shadowBlur !== undefined) employeeUpdateData.shadowBlur = dto.shadowBlur;
        if (dto.shadowSpread !== undefined) employeeUpdateData.shadowSpread = dto.shadowSpread;
        if (dto.cardRadius !== undefined) employeeUpdateData.cardRadius = dto.cardRadius;
        if (dto.cardStyleSection !== undefined) employeeUpdateData.cardStyleSection = dto.cardStyleSection;

        if (Object.keys(employeeUpdateData).length > 0) {
          await this.employeeRepo.update(savedEmployee.id, employeeUpdateData);
        }
    
        await this.updateCardDesign(savedEmployee.id, dto);
      } catch (cardError: unknown) {
        const errorMessage = cardError instanceof Error ? cardError.message : 'Unknown error';
        this.logger.error(` فشل إنشاء/تحديث البطاقة: ${errorMessage}`);
      }
    } 

    const finalEmployee = await this.employeeRepo.findOne({
      where: { id: savedEmployee.id },
      relations: ['company', 'cards', 'images']
    });

    if (!finalEmployee) {
      throw new NotFoundException('فشل في جلب بيانات الموظف بعد التحديث');
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديث الموظف بنجاح',
      data: finalEmployee,
    };
  }

  private async handleImagesUpdate(employeeId: number, images: any[]): Promise<void> {
    try {
      if (Array.isArray(images) && images.length === 0) {
        await this.imageRepo.delete({ employeeId });
      } else if (Array.isArray(images) && images.length > 0) {
        await this.imageRepo.delete({ employeeId });
        const validImages = images.filter(img => 
          img && img.imageUrl && typeof img.imageUrl === 'string'
        );

        if (validImages.length > 0) {
          const imageEntities = validImages.map((img, index) => 
            this.imageRepo.create({
              imageUrl: img.imageUrl,
              label: img.label || `image-${index + 1}`,
              publicId: img.publicId || `emp-${employeeId}-${Date.now()}-${index}`,
              employeeId: employeeId
            })
          );
          await this.imageRepo.save(imageEntities);
        }
      }
    } catch (error) {
      this.logger.error(` فشل معالجة الصور: ${error}`);
      throw error;
    }
  }

  private async updateEmployeeImages(employeeId: number, images: any[]): Promise<void> {
    try {
      const validImages = images.filter((image): image is EmployeeImageType => 
        image && 
        typeof image === 'object' && 
        image.imageUrl && 
        typeof image.imageUrl === 'string'
      );

      if (validImages.length !== images.length) {
        this.logger.warn(`⚠️ بعض الصور غير صالحة، سيتم استخدام ${validImages.length} صورة صالحة فقط`);
      }
      
      const oldImages = await this.imageRepo.find({ where: { employeeId } });
      
      await this.imageRepo.manager.transaction(async (transactionalEntityManager) => {
        await transactionalEntityManager.delete(EmployeeImage, { employeeId });
        const imageEntities = validImages.map((imageData, index) => {
          return transactionalEntityManager.create(EmployeeImage, {
            imageUrl: imageData.imageUrl,
            label: imageData.label || 'image',
            publicId: imageData.publicId || `employee-${employeeId}-${Date.now()}-${index}`,
            employeeId: employeeId,
          });
        }); 
        await transactionalEntityManager.save(EmployeeImage, imageEntities);
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تحديث الصور: ${errorMessage}`);
      throw new Error('حدث خطأ أثناء تحديث الصور');
    }
  }

  private async handleDeleteAllImages(employeeId: number): Promise<void> {
    try {
      this.logger.log(` بدء حذف جميع الصور للموظف: ${employeeId}`);
      
      const currentImages = await this.imageRepo.find({ where: { employeeId } });
      this.logger.log(` عدد الصور الموجودة: ${currentImages.length}`);
      
      if (currentImages.length > 0) {
        this.logger.log(` الصور التي سيتم حذفها:`);
        currentImages.forEach((image, index) => {
          this.logger.log(`   ${index + 1}. ${image.imageUrl} (${image.label})`);
        });
        
        const deleteResult = await this.imageRepo.delete({ employeeId });
        this.logger.log(` تم حذف ${deleteResult.affected} صورة`);
        
        const afterDelete = await this.imageRepo.find({ where: { employeeId } });
        this.logger.log(` عدد الصور بعد الحذف: ${afterDelete.length}`);
      } else {
        this.logger.log(`لا توجد صور لحذفها`);
      }
    } catch (error) {
      this.logger.error(` فشل في حذف الصور: ${error}`);
      throw error;
    }
  }

  private async updateCardDesign(employeeId: number, dto: UpdateEmployeeDto): Promise<void> {
    try {
      const card = await this.cardRepo.findOne({
        where: { employeeId }
      });

      if (card) {
        const updateData: Partial<EmployeeCard> = {};
        const designFields = [
          'designId', 'fontColorHead', 'fontColorHead2', 'fontColorParagraph',
          'fontColorExtra', 'sectionBackground', 'Background', 'sectionBackground2',
          'dropShadow', 'qrStyle', 'shadowX', 'shadowY', 'shadowBlur', 
          'shadowSpread', 'cardRadius', 'cardStyleSection'
        ];

        designFields.forEach(field => {
          if (dto[field as keyof UpdateEmployeeDto] !== undefined) {
            updateData[field as keyof EmployeeCard] = dto[field as keyof UpdateEmployeeDto] as any;
          }
        });

        if (Object.keys(updateData).length > 0) {
          await this.cardRepo.update(card.id, updateData);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تحديث تصميم البطاقة: ${errorMessage}`);
    }
  }

  private async handleEmployeeFiles(employee: Employee, files: Express.Multer.File[]): Promise<{ backgroundImageUrl: string | null; updatedFields: string[] }> {
    type ImageMapType = {
      [key: string]: keyof Employee | 'backgroundImage';
    };

    const imageMap: ImageMapType = {
      'profileImageUrl': 'profileImageUrl',
      'secondaryImageUrl': 'secondaryImageUrl',
      'logoUrl': 'logoUrl',
      'contactFormHeaderImageUrl': 'contactFormHeaderImageUrl',
      'testimonialImageUrl': 'testimonialImageUrl',
      'pdfThumbnailUrl': 'pdfThumbnailUrl',
      'pdfFile': 'pdfFileUrl',
      'workLinkImageUrl': 'workLinkImageUrl',
      'workLinkkImageUrl': 'workLinkkImageUrl',
      'workLinkkkImageUrl': 'workLinkkkImageUrl',
      'workLinkkkkImageUrl': 'workLinkkkkImageUrl',
      'workLinkkkkkImageUrl': 'workLinkkkkkImageUrl',
      'facebookImageUrl': 'facebookImageUrl',
      'instagramImageUrl': 'instagramImageUrl',
      'tiktokImageUrl': 'tiktokImageUrl',
      'snapchatImageUrl': 'snapchatImageUrl',
      'xImageUrl': 'xImageUrl',
      'linkedinImageUrl': 'linkedinImageUrl',
      'customImageUrl': 'customImageUrl',
      'workingHoursImageUrl': 'workingHoursImageUrl',
      'backgroundImageUrl': 'backgroundImage',
    };

    const validFiles = files.filter(file => file && file.buffer instanceof Buffer);
    
    if (validFiles.length === 0) {
      return { backgroundImageUrl: null, updatedFields: [] };
    }

    let backgroundImageUrl: string | null = null;
    const updatedFields: string[] = [];

    for (const file of validFiles) {
      try {
        if (!this.validateFileType(file)) {
          this.logger.warn(`نوع الملف غير مدعوم: ${file.mimetype}`);
          continue;
        }

        if (!this.validateFileSize(file)) {
          this.logger.warn(`الملف كبير جداً: ${file.originalname}`);
          continue;
        }

        let result: { secure_url: string; public_id: string };
      
        if (file.originalname.toLowerCase().endsWith('.pdf')) {
          result = await this.uploadPdfToLocal(file, employee.company.id, employee.id);
        } else {
          result = await this.uploadImageToLocal(file, employee.company.id, 'images');
        }

        const field = imageMap[file.fieldname]; 
        
        if (field) {
          if (field === 'backgroundImage') {
            backgroundImageUrl = result.secure_url;
            await this.handleBackgroundImage(employee.id, backgroundImageUrl);
            updatedFields.push('backgroundImage');
          } else if (this.isValidEmployeeField(field)) {
            await this.employeeRepo.update(employee.id, { [field]: result.secure_url });
            updatedFields.push(field);
          }
        } else if (file.fieldname.startsWith('employee_images')) {
          await this.saveEmployeeImage(employee.id, result.secure_url, result.public_id, file.originalname);
          updatedFields.push('employee_images');
        } else {
          this.logger.warn(`حقل غير معروف: ${file.fieldname}`);
        }

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`فشل معالجة الملف ${file.originalname}: ${errorMessage}`);
      }
    }

    return { backgroundImageUrl, updatedFields };
  }

  private async handleBackgroundImage(employeeId: number, imageUrl: string): Promise<void> {
    try {
      const card = await this.ensureEmployeeCardExists(employeeId);
      card.backgroundImage = imageUrl;
      await this.cardRepo.save(card);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل تحديث صورة الخلفية: ${errorMessage}`);
    }
  }

  private async saveEmployeeImage(
    employeeId: number, 
    imageUrl: string, 
    publicId: string, 
    originalName: string
  ): Promise<void> {
    try {
      const label = originalName.split('.')[0];
      const imageEntity = this.imageRepo.create({
        imageUrl,
        publicId,
        label,
        employeeId,
      });

      await this.imageRepo.save(imageEntity);
    
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`فشل حفظ الصورة في الجدول المنفصل: ${errorMessage}`);
    }
  }

  private isValidEmployeeField(field: string): field is keyof Employee {
    const validFields: (keyof Employee)[] = [
      'profileImageUrl', 'secondaryImageUrl', 'logoUrl', 'contactFormHeaderImageUrl',
      'testimonialImageUrl', 'pdfThumbnailUrl', 'pdfFileUrl', 'workLinkImageUrl',
      'workLinkkImageUrl', 'workLinkkkImageUrl', 'workLinkkkkImageUrl', 'workLinkkkkkImageUrl',
      'facebookImageUrl', 'instagramImageUrl', 'tiktokImageUrl', 'snapchatImageUrl',
      'xImageUrl', 'linkedinImageUrl', 'customImageUrl', 'workingHoursImageUrl'
    ];
    return validFields.includes(field as keyof Employee);
  }

  private isCardDesignUpdated(dto: UpdateEmployeeDto, employee: Employee): boolean {
    const designFields: (keyof UpdateEmployeeDto)[] = [
      'name', 'jobTitle', 'designId', 'qrStyle',
      'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',
      'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
      'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 'cardStyleSection'
    ];

    let hasAnyChange = false;

    designFields.forEach(field => {
      const dtoValue = dto[field];
      const employeeValue = employee[field as keyof Employee];

      const hasChanged = dtoValue !== undefined && dtoValue !== employeeValue;
    
      if (hasChanged) {
        hasAnyChange = true;
      }
    });

    return hasAnyChange;
  }

  async remove(id: number) {
    const employeeRes = await this.findOne(id);
    const employee = employeeRes.data;

    const card = await this.cardRepo.findOne({ where: { employee: { id } } });
    if (card) {
      await this.cardRepo.remove(card);
    }

    const images = await this.imageRepo.find({ where: { employee: { id } } });
    if (images.length) {
      await this.imageRepo.remove(images);
    }

    await this.employeeRepo.remove(employee);

    return {
      statusCode: HttpStatus.OK,
      message: 'تم حذف الموظف بنجاح',
    };
  }

  async findByUniqueUrl(uniqueUrl: string, source = 'link', req?: Request) {
    const card = await this.cardRepo.findOne({
      where: { uniqueUrl },
      relations: ['employee', 'employee.company', 'employee.images', 'employee.cards'],
    });

    if (!card || !card.employee) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    const { employee } = card;

    try {
      const subscription = await this.subscriptionService.getCompanySubscription(employee.company.id);

      if (!subscription) {
        throw new NotFoundException('البطاقة غير موجودة');
      }

      const now = new Date();
      const endDate = new Date(subscription.endDate);

      if (subscription.status !== SubscriptionStatus.ACTIVE || endDate < now) {
        throw new NotFoundException('البطاقة غير موجودة');
      }

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(` خطأ في التحقق من الاشتراك: ${error}`);
      throw new NotFoundException('البطاقة غير موجودة');
    }

    let visitSource = source;
  
    if (req && req.query && req.query.source) {
      visitSource = req.query.source as string;
    }

    if (req) {
      await this.visitService.logVisit(employee, visitSource, req);
    } else {
      await this.visitService.logVisitById({
        employeeId: employee.id,
        source: visitSource,
        ipAddress: 'unknown',
      });
    }

    let qrStyle = card.qrStyle;
    if (!qrStyle) {
      const { qrStyle: generatedQr } = await this.cardService.generateCard(employee, card.designId);
      qrStyle = generatedQr;
    }

    const baseUrl = process.env.API_BASE_URL || 'http://89.116.39.168:3000';
    
    const employeeWithFullUrls = {
      ...employee,
      profileImageUrl: this.getFullImageUrl(employee.profileImageUrl ?? null, baseUrl),
      secondaryImageUrl: this.getFullImageUrl(employee.secondaryImageUrl ?? null, baseUrl),
      logoUrl: this.getFullImageUrl(employee.logoUrl ?? null, baseUrl),
      facebookImageUrl: this.getFullImageUrl(employee.facebookImageUrl ?? null, baseUrl),
      instagramImageUrl: this.getFullImageUrl(employee.instagramImageUrl ?? null, baseUrl),
      tiktokImageUrl: this.getFullImageUrl(employee.tiktokImageUrl ?? null, baseUrl),
      snapchatImageUrl: this.getFullImageUrl(employee.snapchatImageUrl ?? null, baseUrl),
      xImageUrl: this.getFullImageUrl(employee.xImageUrl ?? null, baseUrl),
      linkedinImageUrl: this.getFullImageUrl(employee.linkedinImageUrl ?? null, baseUrl),
      customImageUrl: this.getFullImageUrl(employee.customImageUrl ?? null, baseUrl),
      testimonialImageUrl: this.getFullImageUrl(employee.testimonialImageUrl ?? null, baseUrl),
      workingHoursImageUrl: this.getFullImageUrl(employee.workingHoursImageUrl ?? null, baseUrl),
      contactFormHeaderImageUrl: this.getFullImageUrl(employee.contactFormHeaderImageUrl ?? null, baseUrl),
      pdfThumbnailUrl: this.getFullImageUrl(employee.pdfThumbnailUrl ?? null, baseUrl),
      pdfFileUrl: this.getFullImageUrl(employee.pdfFileUrl ?? null, baseUrl),
      workLinkImageUrl: this.getFullImageUrl(employee.workLinkImageUrl ?? null, baseUrl),
      workLinkkImageUrl: this.getFullImageUrl(employee.workLinkkImageUrl ?? null, baseUrl),
      workLinkkkImageUrl: this.getFullImageUrl(employee.workLinkkkImageUrl ?? null, baseUrl),
      workLinkkkkImageUrl: this.getFullImageUrl(employee.workLinkkkkImageUrl ?? null, baseUrl),
      workLinkkkkkImageUrl: this.getFullImageUrl(employee.workLinkkkkkImageUrl ?? null, baseUrl),
  
      images: employee.images?.map(img => ({
        ...img,
        imageUrl: this.getFullImageUrl(img.imageUrl ?? null, baseUrl)
      })) || [],
  
      qrStyle,
      cardInfo: {
        uniqueUrl: card.uniqueUrl,
        designId: card.designId,
        backgroundImage: this.getFullImageUrl(card.backgroundImage ?? null, baseUrl),
      }
    };
    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب بيانات البطاقة بنجاح',
      data: employeeWithFullUrls,
    };
  }

  private getFullImageUrl(imageUrl: string | null, baseUrl: string): string | null {
    if (!imageUrl) {
      return null;
    }
    
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    
    if (imageUrl.startsWith('/uploads/')) {
      return `${baseUrl}${imageUrl}`;
    }
    
    if (imageUrl.startsWith('uploads/')) {
      return `${baseUrl}/${imageUrl}`;
    }
    
    if (imageUrl.startsWith('/')) {
      return `${baseUrl}${imageUrl}`;
    }
    
    return `${baseUrl}/${imageUrl}`;
  }

  async getSecondaryImageUrl(uniqueUrl: string): Promise<{ secondaryImageUrl: string }> {
    const card = await this.cardRepo.findOne({
      where: { uniqueUrl },
      relations: ['employee'],
    });

    if (!card || !card.employee) {
      throw new NotFoundException('البطاقة غير موجودة');
    }

    const baseUrl = process.env.API_BASE_URL || 'http://89.116.39.168:3000';

    const secondaryImageUrl = this.getFullImageUrl(
      card.employee.secondaryImageUrl ?? null, 
      baseUrl
    );
  
    if (!secondaryImageUrl) {
      throw new NotFoundException('صورة التحميل غير متاحة');
    }
      return { secondaryImageUrl };
    }
  
  async exportToExcel(companyId: string): Promise<Buffer> {
    try {
      const employees = await this.employeeRepo.find({
        where: { company: { id: companyId } },
        relations: ['cards'],
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Employees');

      const allPossibleColumns: Array<keyof Employee | keyof EmployeeCard> = [
        'name', 'email', 'conemail', 'emailTitle', 'jobTitle', 'phone', 'conphone', 'phoneTitle',
        'whatsapp', 'wechat', 'telephone', 'cardUrl', 'qrCode', 'designId', 'location', 'locationTitle',
        'conStreet', 'conAdressLine', 'conCity', 'conState', 'conCountry', 'conZipcode', 'conDirection',
        'conGoogleMapUrl', 'smsNumber', 'faxNumber', 'aboutTitle', 'about', 'socialTitle', 'socialDescription',
        'profileImageUrl', 'secondaryImageUrl', 'logoUrl', 'facebook', 'facebookTitle','facebookSubtitle','facebookImageUrl',
        'instagram', 'instgramTitle' , 'instgramSubtitle','instagramImageUrl','tiktok', 'tiktokTitle' , 'tiktokSubtitle' , 'tiktokImageUrl',
        'snapchat', 'snapchatTitle' , 'snapchatSubtitle', 'snapchatImageUrl', 'x' , 'xTitle' , 'xSubtitle' , 'xImageUrl',
        'linkedin' , 'linkedinTitle' , 'linkedinSubtitle' , 'linkedinImageUrl' , 'customImageUrl', 'customImageTitle',
        'customImageDescription', 'testimonialImageUrl', 'testimonialTitle', 'testimonialDescription',
        'testimonialText', 'testimonialName', 'testimonialDesignation', 'workingHoursTitle', 'isOpen24Hours',
        'workingHoursImageUrl', 'workingHours', 'pdfGalleryTitle', 'pdfGalleryDescription', 'pdfFileUrl',
        'pdfThumbnailUrl', 'pdfTitle', 'pdfSubtitle', 'videoTitle', 'videoDescription', 'buttonBlockTitle',
        'buttonBlockDescription', 'buttonLabel', 'buttonLink', 'videoType', 'videoUrl', 'contactFormName',
        'contactFormDisplayType', 'preventMultipleFormViews', 'contactFormHeaderImageUrl', 'contactFormTitle',
        'contactFormDescription', 'contactFieldLabel', 'contactFieldType', 'contactFieldRequired',
        'contactFieldErrorMessage', 'feedbackTitle', 'feedbackDescription', 'feedbackMaxRating',
        'feedbackIconType', 'showRatingLabels', 'lowestRatingLabel', 'highestRatingLabel',
        'collectFeedbackOnLowRating', 'highRatingHeading', 'highRatingDescription', 'highRatingCTA',
        'highRatingRedirectUrl', 'autoRedirectAfterSeconds', 'enableAutoRedirect', 'linksTitle','linksDescription',
        'workLink', 'workLinkTitle','workLinkSubtitle','workLinkImageUrl','workLinkk','workLinkkTitle',
        'workLinkkSubtitle','workLinkkImageUrl','workLinkkk','workLinkkkTitle','workLinkkkSubtitle',
        'workLinkkkImageUrl','workLinkkkk','workLinkkkkTitle','workLinkkkkSubtitle','workLinkkkkImageUrl',
        'workLinkkkkk','workLinkkkkkTitle','workLinkkkkkSubtitle','workLinkkkkkImageUrl','qrStyle',
        
        'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',
        'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
        'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 'cardStyleSection',
        'backgroundImage'
      ];

      const columnsWithData = this.getColumnsWithData(employees, allPossibleColumns);

      sheet.columns = columnsWithData.map(col => ({
        header: this.getColumnHeader(col),
        key: col,
        width: 25,
      }));

      const safeStringify = (value: unknown): string => {
        if (value === null || value === undefined) return '';
        if (value === '') return '';

        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

        if (typeof value === 'object') {
          try {
            const str = JSON.stringify(value);
            return str === '{}' || str === '[]' ? '' : str;
          } catch {
            return '';
          }
        }

        if (typeof value === 'number' || typeof value === 'string') {
          const str = String(value).trim();
          return str === '' ? '' : str;
        }

        return '';
      };

      employees.forEach(emp => {
        const row: Record<string, string> = {};
        const card = emp.cards?.[0];

        columnsWithData.forEach(col => {
          let value: any;

          if (this.isCardColumn(col)) {
            value = card ? (card as any)[col] : '';
          } else {
            if (col === 'workingHours') {
              value = emp.isOpen24Hours ? '' : (emp as any)[col];
            } else {
              value = (emp as any)[col];
            }
          }

          const stringValue = safeStringify(value);
          if (stringValue !== '') {
            row[col] = stringValue;
          }
        });

        if (Object.keys(row).length > 0) {
          sheet.addRow(row);
        }
      });

      if (sheet.rowCount > 0) {
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '2E86AB' }
        };
      }

      const arrayBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(arrayBuffer);

    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)      
        : 'Unknown error';
      throw new Error(` فشل إنشاء ملف Excel: ${errorMessage}`);
    }
  }

  private getColumnsWithData(
    employees: Employee[], 
    allColumns: Array<keyof Employee | keyof EmployeeCard>
  ): string[] {
    const columnsWithData: string[] = [];

    allColumns.forEach(column => {
      const hasData = employees.some(emp => {
        let value: any;

        if (this.isCardColumn(column)) {
          const card = emp.cards?.[0];
          value = card ? (card as any)[column] : null;
        } else {
          if (column === 'workingHours') {
            value = emp.isOpen24Hours ? null : (emp as any)[column];
          } else {
            value = (emp as any)[column];
          }
        }

        return this.hasValue(value);
      });

      if (hasData) {
        columnsWithData.push(column);
      }
    });

    return columnsWithData;
  }

  private isCardColumn(column: string): boolean {
    const cardColumns = [
      'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',
      'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
      'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 
      'cardStyleSection', 'backgroundImage', 'uniqueUrl', 'qrStyle'
    ];
    return cardColumns.includes(column);
  }

  private hasValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (value === '') return false;
    
    if (typeof value === 'boolean') return true;
    
    if (typeof value === 'object') {
      try {
        const str = JSON.stringify(value);
        return !(str === '{}' || str === '[]');
      } catch {
        return false;
      }
    }
    
    if (typeof value === 'number') return true;
    if (typeof value === 'string') return value.trim() !== '';
    
    return false;
  }

  private getColumnHeader(column: string): string {
    const headerMap: { [key: string]: string } = {
      'name': 'name',
      'email': 'email',
      'jobTitle': 'jobTitle',
      'phone': 'phone',
      'cardUrl': 'cardUrl',
      'qrCode': 'qrCode',
      'designId': 'designId',
      'fontColorHead': 'fontColorHead',
      'fontColorHead2': 'fontColorHead2',
      'fontColorParagraph': 'fontColorParagraph',
      'fontColorExtra': 'fontColorExtra',
      'sectionBackground': 'sectionBackground',
      'Background': 'Background',
      'sectionBackground2': 'sectionBackground2',
      'dropShadow': 'dropShadow',
      'shadowX': 'shadowX',
      'shadowY': 'shadowY',
      'shadowBlur': 'shadowBlur',
      'shadowSpread': 'shadowSpread',
      'cardRadius': 'cardRadius',
      'cardStyleSection': 'cardStyleSection',
      'backgroundImage': 'backgroundImage',
      'uniqueUrl': 'uniqueUrl',
      'qrStyle': 'qrStyle',
      'location': 'location',
      'whatsapp': 'whatsapp',
      'about': 'about',
      'workingHours': 'workingHours',
      'facebook': 'facebook',
      'instagram': 'instagram',
      'tiktok': 'tiktok',
      'snapchat': 'snapchat',
      'x': 'x',
      'linkedin': 'linkedin',
      'conemail': 'conemail',
      'conphone': 'conphone',
      'locationTitle': 'locationTitle',
      'aboutTitle': 'aboutTitle',
      'socialTitle': 'socialTitle',
      'socialDescription': 'socialDescription',
      'workingHoursTitle': 'workingHoursTitle',
      'pdfGalleryTitle': 'pdfGalleryTitle',
      'pdfGalleryDescription': 'pdfGalleryDescription',
      'videoTitle': 'videoTitle',
      'videoDescription': 'videoDescription',
      'buttonBlockTitle': 'buttonBlockTitle',
      'buttonBlockDescription': 'buttonBlockDescription',
      'contactFormTitle': 'contactFormTitle',
      'contactFormDescription': 'contactFormDescription',
      'feedbackTitle': 'feedbackTitle',
      'feedbackDescription': 'feedbackDescription',
      'linksTitle': 'linksTitle',
      'linksDescription': 'linksDescription'
    };

    return headerMap[column] || column;
  }

  async importFromExcel(
    filePath: string,
    companyId: string
  ): Promise<{ 
    count: number; 
    imported: Employee[]; 
    skipped: string[]; 
    limitReached: boolean;
    summary: {
      totalRows: number;
      allowedToAdd: number;
      successfullyAdded: number;
      skippedRows: number;
      finalTotal: number;
      maxAllowed: number;
      currentEmployees: number;
      message: string;
    }
  }> {
    const workbook = new ExcelJS.Workbook();
    
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Employees');
    if (!sheet) {
      throw new Error('شيت "Employees" غير موجود');
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new Error('الشركة غير موجودة');
    }

    const currentEmployeeCount = await this.employeeRepo.count({ 
      where: { company: { id: companyId } } 
    });

    const { maxAllowed, remaining } = await this.subscriptionService.getAllowedEmployees(companyId);
    
    const availableSlots = remaining;

    const imported: Employee[] = [];
    const skipped: string[] = [];
    let limitReached = false;

    type ExcelCellObject = { text?: string; hyperlink?: string; richText?: { text: string }[] };

    const normalize = (value: ExcelJS.CellValue): string | number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'object' && value !== null) {
        const cellObj = value as ExcelCellObject;
        const rawText =
        cellObj.text ||
        cellObj.hyperlink ||
        (Array.isArray(cellObj.richText) ? cellObj.richText.map(t => t.text).join('') : '');
        return rawText?.trim() || null;
      }
      if (typeof value === 'string') return value.trim() || null;
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      return null;
    };

    const headerRow = sheet.getRow(1).values as (string | null)[];
    const headers = (headerRow.slice(1) as string[]).map(h => h?.trim().toLowerCase() || '');
    
    const entityColumns = this.employeeRepo.metadata.columns.map(c => c.propertyName);
    const normalizedEntityColumns = entityColumns.map(c => c.toLowerCase());

    const columnMapping: Record<string, string> = {
      'full name': 'name',
      'employee name': 'name',
      'e-mail': 'email',
      'mail': 'email',
      'phone number': 'phone',
      'mobile': 'phone',
      'position': 'jobTitle',
      'job title': 'jobTitle',
      'jobtitle': 'jobTitle',
      'design id': 'designId',
      'designid': 'designId',
      'image': 'imageUrl',
      'image url': 'imageUrl',
      'imageurl': 'imageUrl',
      'profile image': 'profileImageUrl',
      'profileimageurl': 'profileImageUrl',
      'لون عنوان رئيسي': 'fontColorHead',
      'لون عنوان ثانوي': 'fontColorHead2', 
      'لون الفقرات': 'fontColorParagraph',
      'لون النص الإضافي': 'fontColorExtra',
      'خلفية القسم الرئيسي': 'sectionBackground',
      'خلفية البطاقة': 'Background',
      'خلفية القسم الثانوي': 'sectionBackground2',
      'لون الظل': 'dropShadow',
      'إزاحة الظل (x)': 'shadowX',
      'إزاحة الظل (y)': 'shadowY',
      'تعتيم الظل (blur)': 'shadowBlur',
      'انتشار الظل (spread)': 'shadowSpread',
      'زوايا البطاقة': 'cardRadius',
      'نمط قسم البطاقة': 'cardStyleSection',
      'صورة الخلفية': 'backgroundImage',
      'نمط qr': 'qrStyle'
    };

    for (let i = 2; i <= sheet.rowCount; i++) {
      if (imported.length >= availableSlots) {
        const skipMsg = `Row ${i} skipped: تم الوصول للعدد المسموح (${availableSlots} موظف)`;
        skipped.push(skipMsg);
        limitReached = true;
        continue;
      }

      const row = sheet.getRow(i);
      if (!row || row.cellCount === 0) {
        const skipMsg = `Row ${i} skipped: صف فارغ`;
        skipped.push(skipMsg);
        continue;
      }

      const rowData: Record<string, string | number | null> = {};

      headers.forEach((col, index) => {
        if (!col) return;
        const normalizedCol = col.trim().toLowerCase();
        const mappedCol = columnMapping[normalizedCol] || normalizedCol;
        const entityIndex = normalizedEntityColumns.indexOf(mappedCol.toLowerCase());
        if (entityIndex === -1) {
          return;
        }
        const actualEntityKey = entityColumns[entityIndex];
        const cellValue = normalize(row.getCell(index + 1).value);
        rowData[actualEntityKey] = cellValue;
      });

      if (!rowData['name']) {
        const skipMsg = `Row ${i} skipped: يجب إضافة اسم`;
        skipped.push(skipMsg);
        continue;
      }

      try {
        const imageFields = Object.keys(rowData).filter(key =>
          key.toLowerCase().includes('imageurl') ||
          key.toLowerCase().includes('image') ||
          key.toLowerCase().includes('thumbnail')
        );

        for (const field of imageFields) {
          const imgUrl = rowData[field] ? String(rowData[field]).trim() : null;
          const isProfile = field === 'profileImageUrl';

          if (imgUrl && imgUrl.startsWith('http')) {
            rowData[field] = imgUrl;
          } else if (isProfile && (!imgUrl || imgUrl === '')) {
            rowData[field] = '/uploads/default/default-profile.jpg';
          } else {
            rowData[field] = null;
          }
        }

        Object.keys(rowData).forEach(key => {
          if (rowData[key] === '' || rowData[key] === undefined) {
            rowData[key] = null;
          }
        });

        const finalData: Record<string, any> = {
          name: String(rowData['name']),
          company,
        };

        Object.keys(rowData).forEach(key => {
          if (key !== 'name') {
            finalData[key] = rowData[key];
          }
        });

        if (!finalData['email']) {
          finalData['email'] = `employee-${Date.now()}-${i}@company.com`;
        }

        const employee = this.employeeRepo.create(finalData);
        const saved = await this.employeeRepo.save(employee);

        const cardData: Partial<EmployeeCard> = {};
        const cardFields = [
          'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',
          'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
          'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 
          'cardStyleSection', 'backgroundImage', 'qrStyle'
        ];

        cardFields.forEach(field => {
          if (rowData[field] !== null && rowData[field] !== undefined && rowData[field] !== '') {
            const value = rowData[field];
            
            if (field === 'shadowX' || field === 'shadowY' || field === 'shadowBlur' || 
                field === 'shadowSpread' || field === 'cardRadius') {
              (cardData as any)[field] = Number(value);
            } else if (field === 'cardStyleSection') {
              (cardData as any)[field] = value === 'true' || value === 'TRUE' || value === '1';
            } else if (field === 'qrStyle') {
              (cardData as any)[field] = Number(value);
            } else {
              (cardData as any)[field] = String(value);
            }
          }
        });

        const designId = finalData['designId'] && String(finalData['designId']).trim() !== '' 
          ? String(finalData['designId']) 
          : undefined;

        const qrStyle = finalData['qrStyle'] && String(finalData['qrStyle']).trim() !== ''
          ? Number(finalData['qrStyle'])
          : undefined;

        const { cardUrl, qrCode, designId: generatedDesignId } = await this.cardService.generateCard(
          saved, 
          designId,
          qrStyle,
          cardData
        );

        saved.cardUrl = cardUrl;
        saved.qrCode = qrCode;
        if (!saved.designId) saved.designId = generatedDesignId;

        await this.employeeRepo.save(saved);

        await this.updateEmployeeCard(saved.id, cardData);

        imported.push(saved);

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        const skipMsg = `Row ${i} skipped: خطأ في الحفظ: ${msg}`;
        this.logger.error(skipMsg);
        skipped.push(skipMsg);
      }
    }

    let message = '';
    if (availableSlots === 0) {
      if (currentEmployeeCount > maxAllowed) {
        message = `تم تجاوز الحد الأقصى للموظفين (${currentEmployeeCount}/${maxAllowed}) - يرجى ترقية الخطة`;
      } else {
        message = `تم الوصول للحد الأقصى للموظفين (${currentEmployeeCount}/${maxAllowed})`;
      }
    } else if (limitReached) {
      message = `تم إضافة ${availableSlots} موظف فقط (العدد المسموح في الخطة)`;
    }

    const summary = {
      totalRows: sheet.rowCount - 1,
      allowedToAdd: availableSlots,
      successfullyAdded: imported.length,
      skippedRows: skipped.length,
      finalTotal: currentEmployeeCount + imported.length,
      maxAllowed: maxAllowed,
      currentEmployees: currentEmployeeCount,
      message
    };

    return { 
      count: imported.length, 
      imported, 
      skipped,
      limitReached,
      summary
    };
  }

  private async updateEmployeeCard(employeeId: number, cardData: Partial<EmployeeCard>): Promise<void> {
    try {
      let card = await this.cardRepo.findOne({ where: { employeeId } });
      
      if (card) {
        Object.assign(card, cardData);
        await this.cardRepo.save(card);
      } else {
        card = this.cardRepo.create({
          employeeId,
          ...cardData,
          title: `بطاقة الموظف ${employeeId}`,
          uniqueUrl: randomUUID(),
        });
        await this.cardRepo.save(card);
      }
    } catch (error) {
      this.logger.error(`فشل تحديث بطاقة الموظف ${employeeId}: ${error}`);
    }
  }
}