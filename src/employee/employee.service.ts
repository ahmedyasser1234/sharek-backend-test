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
import { Repository  } from 'typeorm';
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
import jwt from 'jsonwebtoken';
import { createEmployeePass } from '../wallet/passkit.adapter';
import { CloudinaryService } from '../common/services/cloudinary.service';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';


type VideoType = 'youtube' | 'vimeo';
type ContactFormDisplayType = 'overlay' | 'inline';
type ContactFieldType = 'email' | 'phone' | 'one-line' | 'multi-line';
type FeedbackIconType = 'star' | 'heart' | 'thumb' | 'smile';

const allowedVideoTypes: VideoType[] = ['youtube', 'vimeo'];
const allowedContactFormDisplayTypes: ContactFormDisplayType[] = ['overlay', 'inline'];
const allowedContactFieldTypes: ContactFieldType[] = ['email', 'phone', 'one-line', 'multi-line'];
const allowedFeedbackIconTypes: FeedbackIconType[] = ['star', 'heart', 'thumb', 'smile'];

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(EmployeeCard) private readonly cardRepo: Repository<EmployeeCard>,
    @InjectRepository(EmployeeImage) private readonly imageRepo: Repository<EmployeeImage>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly subscriptionService: SubscriptionService,
    private readonly visitService: VisitService,
    private readonly cardService: CardService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

private safeToString(value: unknown): string {
  if (value === null || value === undefined) return 'null/undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  try {
    return value.toString();
  } catch {
    return '[Unstringifiable]';
  }
}

  async create(dto: CreateEmployeeDto, companyId: string, files: Express.Multer.File[]) {
  this.logger.log(` محاولة إنشاء موظف جديد للشركة: ${companyId}`);
  this.logger.log(` جاري البحث عن الشركة: ${companyId}`);

  const company = await this.companyRepo.findOne({ where: { id: companyId } });

  if (!company) {
    this.logger.error(` الشركة غير موجودة: ${companyId}`);
    throw new NotFoundException('Company not found');
  }

  this.logger.log(` تم العثور على الشركة: ${company.name}`);

  this.logger.log(` جاري التحقق من إمكانية إضافة موظف جديد...`);

  const { canAdd, allowed, current, maxAllowed } = await this.subscriptionService.canAddEmployee(companyId);

  this.logger.log(` التحقق: ${canAdd ? 'مسموح' : 'ممنوع'}, المتبقي: ${allowed}, الحالي: ${current}, الحد الأقصى: ${maxAllowed}`);

  if (!canAdd) {
    this.logger.error(` الشركة ${companyId} حاولت إضافة موظف بدون اشتراك نشط أو تجاوز الحد`);
    throw new ForbiddenException(`الخطة لا تسمح بإضافة موظفين جدد - تم الوصول للحد الأقصى (${current}/${maxAllowed}) - يرجى ترقية الخطة`);
  }

  this.logger.log(` جاري التحقق من الحد المسموح للموظفين...`);

  const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);

  this.logger.log(` الحد المسموح: ${allowedCount.maxAllowed}, المتبقي: ${allowedCount.remaining}, الحالي: ${allowedCount.current}`);

  if (allowedCount.remaining <= 0) {
    this.logger.error(` الشركة ${companyId} حاولت إضافة موظف بدون اشتراك نشط أو تجاوز الحد`);
    throw new ForbiddenException('الخطة لا تسمح بإضافة موظفين جدد - يرجى تجديد الاشتراك');
  }

  this.logger.log(` الشركة ${companyId} لديها إذن لإضافة موظفين (متبقي: ${allowedCount.remaining})`);

  this.logger.log(` جاري معالجة ساعات العمل...`);

  let workingHours: Record<string, { from: string; to: string }> | null = null;
  let isOpen24Hours = false;
  let showWorkingHours = dto.showWorkingHours ?? false;

  if (showWorkingHours) {
    if (dto.isOpen24Hours) {
      isOpen24Hours = true;
      this.logger.log(` الموظف يعمل 24 ساعة`);
    } else if (dto.workingHours && Object.keys(dto.workingHours).length > 0) {
      workingHours = dto.workingHours;
      this.logger.log(` تم تعيين ساعات العمل: ${Object.keys(workingHours).join(', ')}`);
    } else {
      showWorkingHours = false;
      this.logger.log(` تم إيقاف عرض ساعات العمل لعدم وجود بيانات`);
    }
  }

  this.logger.log(` جاري تحضير بيانات الموظف...`);

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

  this.logger.log(` بيانات الموظف: ${employeeData.name}`);

  this.logger.log(` جاري إنشاء الموظف في قاعدة البيانات...`);
  const employee = this.employeeRepo.create(employeeData);
  let saved = await this.employeeRepo.save(employee);
  this.logger.log(` تم حفظ الموظف: ${saved.name} (ID: ${saved.id})`);

  type ImageMapType = {
    profileImageUrl: 'profileImageUrl';
    secondaryImageUrl: 'secondaryImageUrl';
    logoUrl : 'logoUrl',
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
    'logoUrl' : 'logoUrl',
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

  this.logger.log(` خريطة الصور جاهزة: ${Object.keys(imageMap).join(', ')}`);

  files = Array.isArray(files) ? files : [];
  this.logger.log(` عدد الملفات المستلمة: ${files.length}`);

  const validFiles = files.filter(file => file && file.buffer instanceof Buffer);
  this.logger.log(` عدد الملفات الصالحة: ${validFiles.length}`);

  this.logger.log(` أسماء حقول الملفات المستلمة:`);
  validFiles.forEach((file, index) => {
    this.logger.log(`    ${index + 1}. ${file.fieldname} - ${file.originalname} - ${file.size} bytes`);
  });

  this.logger.log(` تحليل مفصل لحقول الملفات:`);
  validFiles.forEach((file, index) => {
    const isPdf = file.originalname.toLowerCase().endsWith('.pdf');
    const isPdfField = file.fieldname.includes('pdf');

    this.logger.log(`    ${index + 1}. ${file.fieldname}`);
    this.logger.log(`      الاسم: ${file.originalname}`);
    this.logger.log(`       الحجم: ${file.size} bytes`);
    this.logger.log(`       نوع الملف: ${isPdf ? 'PDF' : 'صورة'}`);
    this.logger.log(`       حقل PDF: ${isPdfField ? 'نعم' : 'لا'}`);
    this.logger.log(`       موجود في imageMap: ${file.fieldname in imageMap ? 'نعم' : 'لا'}`);

    if (isPdf && isPdfField) {
      this.logger.log(`       ملف PDF في حقل: ${file.fieldname}`);
    }
  });

  const pdfFiles = validFiles.filter(file => 
    file.originalname.toLowerCase().endsWith('.pdf')
  );

  if (pdfFiles.length > 0) {
    this.logger.log(` تم العثور على ${pdfFiles.length} ملف PDF:`);
    pdfFiles.forEach((file, index) => {
      this.logger.log(`   ${index + 1}. الحقل: "${file.fieldname}" - الملف: "${file.originalname}"`);
    });
  } else {
    this.logger.warn(` لم يتم العثور على أي ملف PDF في الطلب`);
  }

  const pdfFieldsInMap = Object.keys(imageMap).filter(key => key.includes('pdf'));
  this.logger.log(` حقول PDF في imageMap: ${pdfFieldsInMap.join(', ')}`);

  const hasPdfFile = validFiles.some(file => 
    (file.fieldname === 'pdfFileUrl' || file.fieldname === 'pdfFile') && 
    file.originalname.toLowerCase().endsWith('.pdf')
  );

  if (!hasPdfFile) {
    this.logger.warn(` لم يتم إرسال ملف PDF في حقل pdfFile أو pdfFileUrl`);
    this.logger.warn(` سيتم تعيين pdfFileUrl إلى null في قاعدة البيانات`);
  } else {
    this.logger.log(` تم العثور على ملف PDF في الطلب`);
  }

  function chunkArray<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  const batches = chunkArray(validFiles, 2);
  this.logger.log(` تم تقسيم الملفات إلى ${batches.length} مجموعة`);

  let backgroundImageUrl: string | null = null;
  let uploadedImagesCount = 0;

  interface FileUploadResult {
    secure_url: string;
    public_id: string;
  }

  const baseUploadsDir: string = path.join(process.cwd(), 'uploads');
  const companyPdfsDir: string = path.join(baseUploadsDir, companyId, 'pdfs');

  if (!fs.existsSync(companyPdfsDir)) {
    fs.mkdirSync(companyPdfsDir, { recursive: true });
    this.logger.log(` تم إنشاء فولدر PDFs: ${companyPdfsDir}`);
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    this.logger.log(`--- معالجة المجموعة ${batchIndex + 1}/${batches.length} (${batch.length} ملف) ---`);

    await Promise.allSettled(
      batch.map(async (file, fileIndex) => {
        try {
          this.logger.log(` جاري رفع الملف ${fileIndex + 1} في المجموعة: ${file.fieldname} - ${file.originalname}`);

          if (file.size > 3 * 1024 * 1024) {
            throw new BadRequestException('الملف أكبر من 3MB');
          }

          let result: FileUploadResult;

          if (file.originalname.toLowerCase().endsWith('.pdf')) {
            this.logger.log(` جاري حفظ ملف PDF محلياً: ${file.originalname}`);

            const fileExtension: string = path.extname(file.originalname);
            const uniqueFileName: string = `pdf_${Date.now()}_${saved.id}${fileExtension}`;
            const filePath: string = path.join(companyPdfsDir, uniqueFileName);

            await fs.promises.writeFile(filePath, file.buffer);

            const fileUrl: string = `/uploads/${companyId}/pdfs/${uniqueFileName}`;

            result = {
              secure_url: fileUrl,
              public_id: uniqueFileName
            };
            this.logger.log(` تم حفظ PDF محلياً: ${result.secure_url}`);
            this.logger.log(`مسار الملف المحلي: ${filePath}`);

          } else {
            this.logger.log(` جاري ضغط الصورة: ${file.originalname}`);
            const compressedBuffer = await sharp(file.buffer, { failOnError: false })
              .resize({ width: 800 })
              .webp({ quality: 70 })
              .toBuffer();
            this.logger.log(` تم ضغط الصورة: ${file.originalname}`);

            this.logger.log(` جاري رفع الصورة إلى Cloudinary...`);
            const uploadResult = await this.cloudinaryService.uploadBuffer(
              compressedBuffer,
              `companies/${companyId}/employees`
            ) as FileUploadResult;
            result = uploadResult;
            this.logger.log(` تم رفع الصورة: ${result.secure_url}`);
          }
          const fieldName = file.fieldname as keyof ImageMapType;
          const field = imageMap[fieldName];
          this.logger.log(` حقل الصورة: ${field} للملف: ${file.fieldname}`);

          if (field) {
            if (field === 'backgroundImage') {
              backgroundImageUrl = result.secure_url;
              this.logger.log(` تم رفع صورة الخلفية: ${backgroundImageUrl}`);
            } else {
              this.logger.log(` تحديث حقل ${field} في قاعدة البيانات...`);
              
              const updateData: Partial<Employee> = { [field]: result.secure_url };
              await this.employeeRepo.update(saved.id, updateData);
              
              (saved as any)[field] = result.secure_url;
              this.logger.log(` تم تحديث ${field}: ${result.secure_url}`);
              uploadedImagesCount++;
            }
          } else {
            this.logger.log(` حفظ الملف في جدول الصور المنفصل...`);
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
            this.logger.log(` تم حفظ الملف في الجدول المنفصل: ${label}`);
            uploadedImagesCount++;
          }

        } catch (error: unknown) {
          const errMsg = error instanceof Error && typeof error.message === 'string'
            ? error.message
            : 'Unknown error';
          const fileName = typeof file.originalname === 'string' ? file.originalname : 'غير معروف';
          this.logger.error(` فشل رفع ملف ${fileName}: ${errMsg}`);
        }
      })
    );
    this.logger.log(` انتهت معالجة المجموعة ${batchIndex + 1}`);
  }

  this.logger.log(` إجمالي الصور المرفوعة: ${uploadedImagesCount}`);

  if (!saved.profileImageUrl) {
    this.logger.log(` استخدام الصورة الافتراضية للملف الشخصي`);
    saved.profileImageUrl = 'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
    await this.employeeRepo.update(saved.id, { profileImageUrl: saved.profileImageUrl });
  }

  this.logger.log(` جاري إنشاء بطاقة الموظف...`);
  const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved, dto.designId, dto.qrStyle, {
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

  this.logger.log(` تم إنشاء البطاقة: ${cardUrl}`);

  this.logger.log(` جاري تحديث بيانات الموظف النهائية...`);
  saved.cardUrl = cardUrl;
  saved.designId = designId;
  saved.qrCode = qrCode;
  saved = await this.employeeRepo.save(saved);

  this.logger.log(` تم إنشاء الموظف بنجاح للشركة: ${companyId}`);
  this.logger.log(`========================================`);
  this.logger.log(` ملخص إنشاء الموظف:`);
  this.logger.log(`    الاسم: ${saved.name}`);
  this.logger.log(`    الرقم: ${saved.id}`);
  this.logger.log(`    رابط البطاقة: ${saved.cardUrl}`);
  this.logger.log(`   الصور المرفوعة: ${uploadedImagesCount}`);
  this.logger.log(`    صورة الخلفية: ${backgroundImageUrl ? 'نعم' : 'لا'}`);
  this.logger.log(`    فولدر PDFs المحلي: /uploads/${companyId}/pdfs/`);
  this.logger.log(`    ملف PDF: ${hasPdfFile ? 'تم رفعه' : 'لم يتم رفعه'}`);
  this.logger.log(`========================================`);

  return {
    statusCode: HttpStatus.CREATED,
    message: 'تم إنشاء الموظف بنجاح',
    data: { ...saved, qrCode },
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
        message: ' تم جلب بيانات الموظف بنجاح',
        data: employee,
    };
}

  async generateGoogleWalletLink(employeeId: number): Promise<{ url: string }> {
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      relations: ['company'],
    });

    if (!employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    const jwtPayload = {
      iss: process.env.GOOGLE_ISSUER_ID,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        name: employee.name,
        jobTitle: employee.jobTitle,
        qrCode: employee.qrCode,
      },
    };

    const token = jwt.sign(jwtPayload, process.env.GOOGLE_PRIVATE_KEY!, {
      algorithm: 'RS256',
    });
    const url = `https://pay.google.com/gp/v/save/${token}`;
    employee.googleWalletUrl = url;
    await this.employeeRepo.save(employee);
    return { url };
  }

  async generateAppleWalletPass(employeeId: number): Promise<Buffer> {
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
        companyName: employee.company.name,
        qrCode: employee.qrCode,
        cardUrl: employee.cardUrl,
      });

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

      const url = `${process.env.API_BASE_URL}/employees/${employeeId}/apple-wallet`;
      employee.appleWalletUrl = url;
      await this.employeeRepo.save(employee);

      return buffer;
  }
 
   private async ensureEmployeeCardExists(employeeId: number): Promise<EmployeeCard> {
    let card = await this.cardRepo.findOne({ 
      where: { employeeId: employeeId }
    });
    
    if (!card) {
      this.logger.log(` إنشاء كارد جديد للموظف: ${employeeId}`);
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
      this.logger.log(` تم إنشاء كارد جديد: ${card.id}`);
    }
    
    return card;
  }

  async update(
    id: number, 
    dto: UpdateEmployeeDto, 
    companyId: string, 
    files?: Express.Multer.File[]
  ) {

    this.logger.log(` تحديث الموظف: ${id} للشركة: ${companyId}`);
  
    const employee = await this.employeeRepo.findOne({
      where: { id, company: { id: companyId } },
      relations: ['company', 'cards', 'images']
    });

    if (!employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    await this.ensureEmployeeCardExists(employee.id);

    let workingHours: Record<string, { from: string; to: string }> | null = null;
    let isOpen24Hours = false;
    let showWorkingHours = dto.showWorkingHours ?? employee.showWorkingHours;

    if (showWorkingHours) {
      if (dto.isOpen24Hours) {
        isOpen24Hours = true;
        this.logger.log(` الموظف يعمل 24 ساعة`);
      } else if (dto.workingHours && Object.keys(dto.workingHours).length > 0) {
        workingHours = dto.workingHours;
        this.logger.log(` تم تعيين ساعات العمل: ${Object.keys(workingHours).join(', ')}`);
      } else {
        showWorkingHours = false;
        this.logger.log(` تم إيقاف عرض ساعات العمل لعدم وجود بيانات`);
      }
    }

    const updateData: Partial<Employee> = {
      ...dto,
      showWorkingHours,
      isOpen24Hours,
      workingHours,
      cardStyleSection: dto.cardStyleSection ?? employee.cardStyleSection,
      videoType: allowedVideoTypes.includes(dto.videoType as VideoType)
      ? (dto.videoType as VideoType)
      : employee.videoType,
      contactFormDisplayType: allowedContactFormDisplayTypes.includes(dto.contactFormDisplayType as ContactFormDisplayType)
      ? (dto.contactFormDisplayType as ContactFormDisplayType)
      : employee.contactFormDisplayType,
      contactFieldType: allowedContactFieldTypes.includes(dto.contactFieldType as ContactFieldType)
      ? (dto.contactFieldType as ContactFieldType)
      : employee.contactFieldType,
      feedbackIconType: allowedFeedbackIconTypes.includes(dto.feedbackIconType as FeedbackIconType)
      ? (dto.feedbackIconType as FeedbackIconType)
      : employee.feedbackIconType,
    };

    Object.assign(employee, updateData);
    let savedEmployee = await this.employeeRepo.save(employee);
    this.logger.log(` تم تحديث البيانات الأساسية للموظف: ${savedEmployee.id}`);

    let backgroundImageUrl: string | null = null;
      if (files && files.length > 0) {
        backgroundImageUrl = await this.handleEmployeeFiles(savedEmployee, files);
      }

      if (!savedEmployee.profileImageUrl) {
        savedEmployee.profileImageUrl = 'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
        savedEmployee = await this.employeeRepo.save(savedEmployee);
      }

      const designFields: (keyof UpdateEmployeeDto)[] = [
        'name', 'jobTitle', 'designId', 'qrStyle',
        'fontColorHead', 'fontColorHead2', 'fontColorParagraph', 'fontColorExtra',
        'sectionBackground', 'Background', 'sectionBackground2', 'dropShadow',
        'shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'cardRadius', 'cardStyleSection'
      ];

      const hasDesignChanges = designFields.some(field => dto[field] !== undefined);
      const hasFiles = files && files.length > 0;
      const isCardUpdated = hasDesignChanges || hasFiles;

      if (isCardUpdated) {
        this.logger.log(` إنشاء/تحديث بطاقة للموظف: ${savedEmployee.id}`);
        this.logger.log(` سبب التحديث: ${hasFiles ? 'وجود ملفات جديدة' : 'تغيير في حقول التصميم'}`);
    
        if (hasDesignChanges) {
          const changedFields = designFields.filter(field => dto[field] !== undefined);
          this.logger.log(` الحقول المتغيرة: ${changedFields.join(', ')}`);
        }
    
        try {
          const { cardUrl, qrCode, designId } = await this.cardService.generateCard(
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
              backgroundImage: backgroundImageUrl,
            }
          );

          const employeeUpdateData: Partial<Employee> = {
            cardUrl,
            designId,
            qrCode,
            shadowX: dto.shadowX,
            shadowY: dto.shadowY,
            shadowBlur: dto.shadowBlur,
            shadowSpread: dto.shadowSpread,
            cardRadius: dto.cardRadius,
            cardStyleSection: dto.cardStyleSection,
          };
          this.logger.log(` تحديث بيانات الموظف في الـ database...`);
          await this.employeeRepo.update(savedEmployee.id, employeeUpdateData);
          await this.updateCardDesign(savedEmployee.id, dto);
      
          const updatedEmployee = await this.employeeRepo.findOne({
            where: { id: savedEmployee.id },
            relations: ['company', 'cards', 'images']
          });

          if (updatedEmployee) {
            savedEmployee = updatedEmployee;
          }

          this.logger.log(` رابط البطاقة بعد التحديث: ${savedEmployee.cardUrl}`);
          this.logger.log(` التصميم بعد التحديث: ${savedEmployee.designId}`);
      
        } catch (cardError: unknown) {
          const errorMessage = cardError instanceof Error ? cardError.message : 'Unknown error';
          this.logger.error(` فشل إنشاء/تحديث البطاقة: ${errorMessage}`);
        }
      } else {
        this.logger.log(` لا توجد تغييرات في تصميم البطاقة للموظف: ${savedEmployee.id}`);
      }

      const finalEmployee = await this.employeeRepo.findOne({
        where: { id: savedEmployee.id },
        relations: ['company', 'cards', 'images']
      });

      return {
        statusCode: HttpStatus.OK,
        message: 'تم تحديث الموظف بنجاح',
        data: finalEmployee || savedEmployee,
      };
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
            this.logger.log(` تم تحديث تصميم البطاقة للموظف: ${employeeId}`);
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(` فشل تحديث تصميم البطاقة: ${errorMessage}`);
      }
  }

  private async handleEmployeeFiles(employee: Employee, files: Express.Multer.File[]): Promise<string | null> {
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
      return null;
    }

    this.logger.log(` معالجة ${validFiles.length} ملف للموظف: ${employee.id}`);

    let backgroundImageUrl: string | null = null;

    for (const file of validFiles) {
      try {
        if (file.size > 3 * 1024 * 1024) {
          this.logger.warn(` الملف كبير جداً: ${file.originalname}`);
          continue;
        }

        let result: { secure_url: string; public_id: string };
      
        if (file.originalname.toLowerCase().endsWith('.pdf')) {
          result = await this.handlePdfUpload(file, employee.company.id, employee.id);
        } else {
          result = await this.handleImageUpload(file, employee.company.id);
        }

        const field = imageMap[file.fieldname]; 
        if (field) {
          if (field === 'backgroundImage') {
            backgroundImageUrl = result.secure_url;
            await this.handleBackgroundImage(employee.id, backgroundImageUrl);
          } else if (this.isValidEmployeeField(field)) {
            await this.employeeRepo.update(employee.id, { [field]: result.secure_url });
            this.logger.log(` تم تحديث حقل ${field} للموظف ${employee.id}`);
          }
        } else if (file.fieldname.startsWith('employee_images')) {
          await this.saveEmployeeImage(employee.id, result.secure_url, result.public_id, file.originalname);
          this.logger.log(`تم حفظ صورة إضافية للموظف ${employee.id}`);
        } else {
          this.logger.warn(` حقل غير معروف: ${file.fieldname}`);
        }

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(` فشل معالجة الملف ${file.originalname}: ${errorMessage}`);
      }
    }

    return backgroundImageUrl;
  }

  private async handleBackgroundImage(employeeId: number, imageUrl: string): Promise<void> {
    try {
      const card = await this.ensureEmployeeCardExists(employeeId);
      card.backgroundImage = imageUrl;
      await this.cardRepo.save(card);
      this.logger.log(` تم تحديث صورة الخلفية للبطاقة: ${employeeId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل تحديث صورة الخلفية: ${errorMessage}`);
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
      this.logger.log(` تم حفظ الصورة في الجدول المنفصل للموظف: ${employeeId}`);
    
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(` فشل حفظ الصورة في الجدول المنفصل: ${errorMessage}`);
    }
  }

  private isValidEmployeeField(field: string): field is keyof Employee {
    const validFields: (keyof Employee)[] = [
      'profileImageUrl', 'secondaryImageUrl', 'logoUrl' ,'contactFormHeaderImageUrl',
      'testimonialImageUrl', 'pdfThumbnailUrl', 'pdfFileUrl', 'workLinkImageUrl',
      'workLinkkImageUrl', 'workLinkkkImageUrl', 'workLinkkkkImageUrl', 'workLinkkkkkImageUrl',
      'facebookImageUrl', 'instagramImageUrl', 'tiktokImageUrl', 'snapchatImageUrl',
      'xImageUrl', 'linkedinImageUrl', 'customImageUrl', 'workingHoursImageUrl'
    ];
    return validFields.includes(field as keyof Employee);
  }

  private async handlePdfUpload(
    file: Express.Multer.File, 
    companyId: string, 
    employeeId: number
  ): Promise<{ secure_url: string; public_id: string }> {
    const baseUploadsDir = path.join(process.cwd(), 'uploads');
    const companyPdfsDir = path.join(baseUploadsDir, companyId, 'pdfs');
  
    if (!fs.existsSync(companyPdfsDir)) {
      fs.mkdirSync(companyPdfsDir, { recursive: true });
    }

    const fileExtension = path.extname(file.originalname);
    const uniqueFileName = `pdf_${Date.now()}_${employeeId}${fileExtension}`;
    const filePath = path.join(companyPdfsDir, uniqueFileName);
    await fs.promises.writeFile(filePath, file.buffer);
    const fileUrl = `/uploads/${companyId}/pdfs/${uniqueFileName}`;
  
    return {
      secure_url: fileUrl,
      public_id: uniqueFileName
    };
  }

  private async handleImageUpload(
    file: Express.Multer.File, 
    companyId: string
  ): Promise<{ secure_url: string; public_id: string }> {
    const compressedBuffer = await sharp(file.buffer, { failOnError: false })
    .resize({ width: 800 })
    .webp({ quality: 70 })
    .toBuffer();

    const uploadResult = await this.cloudinaryService.uploadBuffer(
      compressedBuffer,
      `companies/${companyId}/employees`
    ) as { secure_url: string; public_id: string };

    return uploadResult;
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
      this.logger.log(` فحص حقل ${String(field)}: DTO=${this.safeToString(dtoValue)}, Employee=${this.safeToString(employeeValue)}`);

      const hasChanged = dtoValue !== undefined && dtoValue !== employeeValue;
    
      if (hasChanged) {
        hasAnyChange = true;
        this.logger.log(` تغيير في حقل ${String(field)}: "${this.safeToString(employeeValue)}" → "${this.safeToString(dtoValue)}"`);
      }
    });

    this.logger.log(` إجمالي التغييرات: ${hasAnyChange ? 'نعم' : 'لا'}`);
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
      message: ' تم حذف الموظف بنجاح',
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
    if (req) {
      await this.visitService.logVisit(employee, source, req);
    } else {
      await this.visitService.logVisitById({
        employeeId: employee.id,
        source,
        ipAddress: 'unknown',
      });
    }

    let qrStyle = card.qrStyle;
    if (!qrStyle) {
      const { qrStyle: generatedQr } = await this.cardService.generateCard(employee, card.designId);
      qrStyle = generatedQr;
    }

    const employeeWithQrCode = {
      ...employee,
      qrStyle,
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'تم جلب بيانات البطاقة بنجاح',
      data: employeeWithQrCode,
    };
  }
  
  async exportToExcel(companyId: string): Promise<Buffer> {
    try {
      const employees = await this.employeeRepo.find({
        where: { company: { id: companyId } },
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Employees');

      const columns: Array<keyof Employee> = [
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
        'workLinkkkkk','workLinkkkkkTitle','workLinkkkkkSubtitle','workLinkkkkkImageUrl','qrStyle'
        
      ];

      sheet.columns = columns.map(col => ({
        header: col,
        key: col,
        width: 30,
      }));

      const safeStringify = (value: unknown): string => {
        if (value === null || value === undefined) return '';

        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch {
            return '[Unserializable Object]';
          }
        }

        if (typeof value === 'number' || typeof value === 'string') {
          return String(value);
        }

        return '';
      };

      employees.forEach(emp => {
        const row: Record<string, string> = {};

        columns.forEach(col => {
          if (col === 'workingHours') {
            row[col] = emp.isOpen24Hours ? '' : safeStringify(emp[col]);
          } else if (typeof emp[col] === 'boolean') {
            row[col] = emp[col] ? 'TRUE' : 'FALSE';
          } else {
            row[col] = safeStringify(emp[col]);
          }
        });

        sheet.addRow(row);
      });

      const arrayBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(arrayBuffer);

    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message)      
      : 'Unknown error';
      throw new Error(`فشل إنشاء ملف Excel: ${errorMessage}`);
    }
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
  this.logger.log(` بدء استيراد ملف Excel: ${filePath} للشركة: ${companyId}`);
  
  const workbook = new ExcelJS.Workbook();
  
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Employees');
  if (!sheet) {
    this.logger.error(' شيت "Employees" غير موجود في الملف');
    throw new Error('شيت "Employees" غير موجود');
  }

  this.logger.log(` عدد الصفوف في الشيت: ${sheet.rowCount}`);

  const company = await this.companyRepo.findOne({ where: { id: companyId } });
  if (!company) {
    this.logger.error(` الشركة غير موجودة: ${companyId}`);
    throw new Error('الشركة غير موجودة');
  }

  this.logger.log(` جاري حساب عدد الموظفين الحاليين...`);
  const currentEmployeeCount = await this.employeeRepo.count({ 
    where: { company: { id: companyId } } 
  });
  this.logger.log(` عدد الموظفين الحاليين: ${currentEmployeeCount}`);

  this.logger.log(` جاري التحقق من الحد المسموح في الخطة...`);
  
  const { maxAllowed, remaining } = await this.subscriptionService.getAllowedEmployees(companyId);
  
  this.logger.log(` الحد الأقصى في الخطة: ${maxAllowed}`);
  this.logger.log(` العدد المتبقي للإضافة: ${remaining}`);

  const availableSlots = remaining;
  this.logger.log(` العدد المسموح بإضافته: ${availableSlots}`);

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
  
  this.logger.log(` العناوين الموجودة في الشيت: ${headers.join(', ')}`);

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
  };

  this.logger.log(` بدء معالجة الصفوف من 2 إلى ${sheet.rowCount}...`);
  this.logger.log(` الهدف: إضافة ${availableSlots} موظف من أصل ${sheet.rowCount - 1} صف`);

  for (let i = 2; i <= sheet.rowCount; i++) {
    this.logger.log(`--- معالجة الصف ${i} ---`);

    if (imported.length >= availableSlots) {
      const skipMsg = `Row ${i} skipped: تم الوصول للعدد المسموح (${availableSlots} موظف)`;
      this.logger.warn(` ${skipMsg}`);
      skipped.push(skipMsg);
      limitReached = true;
      continue;
    }

    const row = sheet.getRow(i);
    if (!row || row.cellCount === 0) {
      const skipMsg = `Row ${i} skipped: صف فارغ`;
      this.logger.warn(` ${skipMsg}`);
      skipped.push(skipMsg);
      continue;
    }

    this.logger.log(` فحص بيانات الصف ${i}...`);

    const rowData: Record<string, string | number | null> = {};

    headers.forEach((col, index) => {
      if (!col) return;
      const normalizedCol = col.trim().toLowerCase();
      const mappedCol = columnMapping[normalizedCol] || normalizedCol;
      const entityIndex = normalizedEntityColumns.indexOf(mappedCol.toLowerCase());
      if (entityIndex === -1) {
        this.logger.debug(` العمود "${col}" غير معروف - تم تخطيه`);
        return;
      }
      const actualEntityKey = entityColumns[entityIndex];
      const cellValue = normalize(row.getCell(index + 1).value);
      rowData[actualEntityKey] = cellValue;
      this.logger.debug(` ${actualEntityKey}: ${cellValue}`);
    });

    if (!rowData['name']) {
      const skipMsg = `Row ${i} skipped: يجب إضافة اسم`;
      this.logger.warn(` ${skipMsg}`);
      skipped.push(skipMsg);
      continue;
    }

    this.logger.log(` الصف ${i} يحتوي على اسم: "${rowData['name']}" - جاري المحاولة...`);

    try {
      const imageFields = Object.keys(rowData).filter(key =>
        key.toLowerCase().includes('imageurl') ||
        key.toLowerCase().includes('image') ||
        key.toLowerCase().includes('thumbnail')
      );

      this.logger.log(` حقول الصور الموجودة: ${imageFields.join(', ')}`);

      for (const field of imageFields) {
        const imgUrl = rowData[field] ? String(rowData[field]).trim() : null;
        const isProfile = field === 'profileImageUrl';

        if (imgUrl && imgUrl.startsWith('http')) {
          this.logger.log(` صورة ${field}: ${imgUrl}`);
          rowData[field] = imgUrl;
        } else if (isProfile && (!imgUrl || imgUrl === '')) {
          rowData[field] = 'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
          this.logger.log(` استخدام الصورة الافتراضية للملف الشخصي`);
        } else {
          rowData[field] = null;
          this.logger.log(`صورة ${field}: غير صالحة`);
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
        this.logger.log(` إنشاء إيميل افتراضي: ${finalData['email']}`);
      }

      this.logger.log(` جاري حفظ الموظف في قاعدة البيانات...`);
      const employee = this.employeeRepo.create(finalData);
      const saved = await this.employeeRepo.save(employee);
      this.logger.log(` تم حفظ الموظف: ${saved.name} (ID: ${saved.id})`);

      this.logger.log(` جاري إنشاء بطاقة الموظف...`);
      const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved);
      saved.cardUrl = cardUrl;
      saved.qrCode = qrCode;
      if (!saved.designId) saved.designId = designId;

      await this.employeeRepo.save(saved);
      imported.push(saved);

      this.logger.log(` تم إضافة ${saved.name} بنجاح (${imported.length}/${availableSlots})`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      const skipMsg = `Row ${i} skipped: خطأ في الحفظ: ${msg}`;
      this.logger.error(` ${skipMsg}`);
      skipped.push(skipMsg);
    }
  }

  let message = '';
  if (availableSlots === 0) {
    if (currentEmployeeCount > maxAllowed) {
      message = ` تم تجاوز الحد الأقصى للموظفين (${currentEmployeeCount}/${maxAllowed}) - يرجى ترقية الخطة`;
    } else {
      message = ` تم الوصول للحد الأقصى للموظفين (${currentEmployeeCount}/${maxAllowed})`;
    }
  } else if (limitReached) {
    message = ` تم إضافة ${availableSlots} موظف فقط (العدد المسموح في الخطة)`;
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

  
  if (summary.message) {
    this.logger.log(`    ${summary.message}`);
  }
  
  
  return { 
    count: imported.length, 
    imported, 
    skipped,
    limitReached,
    summary
  };
}

}