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

async create(dto: CreateEmployeeDto, companyId: string, files: Express.Multer.File[]) {
    this.logger.log(`🎯 محاولة إنشاء موظف جديد للشركة: ${companyId}`);
    
    // البحث عن الشركة
    this.logger.log(`🔍 جاري البحث عن الشركة: ${companyId}`);
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
        this.logger.error(`❌ الشركة غير موجودة: ${companyId}`);
        throw new NotFoundException('Company not found');
    }
    this.logger.log(`✅ تم العثور على الشركة: ${company.name}`);

    // التحقق من الاشتراك
    this.logger.log(`📊 جاري التحقق من الحد المسموح للموظفين...`);
    const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
    this.logger.log(`📋 الحد المسموح: ${allowedCount}`);
    
    if (allowedCount <= 0) {
        this.logger.error(`🚫 الشركة ${companyId} حاولت إضافة موظف بدون اشتراك نشط أو تجاوز الحد`);
        throw new ForbiddenException('الخطة لا تسمح بإضافة موظفين جدد - يرجى تجديد الاشتراك');
    }
    this.logger.log(`✅ الشركة ${companyId} لديها إذن لإضافة موظفين (متبقي: ${allowedCount})`);

    // معالجة ساعات العمل
    this.logger.log(`⏰ جاري معالجة ساعات العمل...`);
    let workingHours: Record<string, { from: string; to: string }> | null = null;
    let isOpen24Hours = false;
    let showWorkingHours = dto.showWorkingHours ?? false;
    
    if (showWorkingHours) {
        if (dto.isOpen24Hours) {
            isOpen24Hours = true;
            this.logger.log(`🏪 الموظف يعمل 24 ساعة`);
        } else if (dto.workingHours && Object.keys(dto.workingHours).length > 0) {
            workingHours = dto.workingHours;
            this.logger.log(`🕒 تم تعيين ساعات العمل: ${Object.keys(workingHours).join(', ')}`);
        } else {
            showWorkingHours = false;
            this.logger.log(`⚠️ تم إيقاف عرض ساعات العمل لعدم وجود بيانات`);
        }
    }

    // تحضير بيانات الموظف
    this.logger.log(`📝 جاري تحضير بيانات الموظف...`);
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

    this.logger.log(`👤 بيانات الموظف: ${employeeData.name}`);

    // إنشاء وحفظ الموظف
    this.logger.log(`💾 جاري إنشاء الموظف في قاعدة البيانات...`);
    const employee = this.employeeRepo.create(employeeData);
    let saved = await this.employeeRepo.save(employee);
    this.logger.log(`✅ تم حفظ الموظف: ${saved.name} (ID: ${saved.id})`);

    // خريطة الصور - معدلة بناءً على أسماء الحقول الفعلية
    const imageMap = {
        // الحقول الأساسية
        'profileImageUrl': 'profileImageUrl',
        'secondaryImageUrl': 'secondaryImageUrl',
        
        // وسائل التواصل
        'facebookImageUrl': 'facebookImageUrl',
        'instagramImageUrl': 'instagramImageUrl', 
        'tiktokImageUrl': 'tiktokImageUrl',
        'snapchatImageUrl': 'snapchatImageUrl',
        'xImageUrl': 'xImageUrl',
        'linkedinImageUrl': 'linkedinImageUrl',
        
        // الصور المخصصة
        'customImageUrl': 'customImageUrl',
        'testimonialImageUrl': 'testimonialImageUrl',
        'workingHoursImageUrl': 'workingHoursImageUrl',
        'contactFormHeaderImageUrl': 'contactFormHeaderImageUrl',
        'pdfThumbnailUrl': 'pdfThumbnailUrl',
        
        // روابط العمل
        'workLinkImageUrl': 'workLinkImageUrl',
        'workLinkkImageUrl': 'workLinkkImageUrl',
        'workLinkkkImageUrl': 'workLinkkkImageUrl',
        'workLinkkkkImageUrl': 'workLinkkkkImageUrl',
        'workLinkkkkkImageUrl': 'workLinkkkkkImageUrl',
        
        // الحقول الجديدة من الـ logs
        'workLinkImageUrl_1': 'workLinkImageUrl',
        'workLinkImageUrl_2': 'workLinkkImageUrl',
        'workLinkImageUrl_3': 'workLinkkkImageUrl',
        
        // الخلفية
        'backgroundImageUrl': 'backgroundImage',
    } as const;

    this.logger.log(`🗺️ خريطة الصور جاهزة: ${Object.keys(imageMap).join(', ')}`);

    // معالجة الملفات
    files = Array.isArray(files) ? files : [];
    this.logger.log(`📁 عدد الملفات المستلمة: ${files.length}`);
    
    const validFiles = files.filter(file => file && file.buffer instanceof Buffer);
    this.logger.log(`✅ عدد الملفات الصالحة: ${validFiles.length}`);

    // تسجيل معلومات الملفات
    this.logger.log(`🔍 أسماء حقول الملفات المستلمة:`);
    validFiles.forEach((file, index) => {
        this.logger.log(`   📄 ${index + 1}. ${file.fieldname} - ${file.originalname} - ${file.size} bytes`);
    });

    function chunkArray<T>(array: T[], size: number): T[][] {
        const result: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    const batches = chunkArray(validFiles, 2);
    this.logger.log(`🔄 تم تقسيم الملفات إلى ${batches.length} مجموعة`);

    let backgroundImageUrl: string | null = null;
    let uploadedImagesCount = 0;

    // معالجة كل مجموعة من الملفات
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        this.logger.log(`--- معالجة المجموعة ${batchIndex + 1}/${batches.length} (${batch.length} ملف) ---`);

        await Promise.allSettled(
            batch.map(async (file, fileIndex) => {
                try {
                    this.logger.log(`📤 جاري رفع الملف ${fileIndex + 1} في المجموعة: ${file.fieldname} - ${file.originalname}`);

                    if (file.size > 3 * 1024 * 1024) {
                        throw new BadRequestException('الملف أكبر من 3MB');
                    }

                    // ضغط الصورة
                    this.logger.log(`🖼️ جاري ضغط الصورة: ${file.originalname}`);
                    const compressedBuffer = await sharp(file.buffer, { failOnError: false })
                        .resize({ width: 800 })
                        .webp({ quality: 70 })
                        .toBuffer();
                    this.logger.log(`✅ تم ضغط الصورة: ${file.originalname}`);

                    // رفع إلى Cloudinary
                    this.logger.log(`☁️ جاري رفع الصورة إلى Cloudinary...`);
                    const result = await this.cloudinaryService.uploadBuffer(
                        compressedBuffer,
                        `companies/${companyId}/employees`
                    );
                    this.logger.log(`✅ تم رفع الصورة: ${result.secure_url}`);

                    const field = imageMap[file.fieldname as keyof typeof imageMap];
                    this.logger.log(`🔍 حقل الصورة: ${field} للملف: ${file.fieldname}`);

                    if (field) {
                        if (field === 'backgroundImage') {
                            backgroundImageUrl = result.secure_url;
                            this.logger.log(`🎨 تم رفع صورة الخلفية: ${backgroundImageUrl}`);
                        } else {
                            // تحديث مباشر في قاعدة البيانات
                            this.logger.log(`🔄 تحديث حقل ${field} في قاعدة البيانات...`);
                            await this.employeeRepo.update(saved.id, { 
                                [field]: result.secure_url 
                            });
                            // تحديث الكائن المحلي أيضاً
                            saved[field] = result.secure_url;
                            this.logger.log(`✅ تم تحديث ${field}: ${result.secure_url}`);
                            uploadedImagesCount++;
                        }
                    } else {
                        this.logger.log(`📸 حفظ الصورة في جدول الصور المنفصل...`);
                        const label = typeof file.originalname === 'string'
                            ? file.originalname.split('.')[0]
                            : 'image';

                        const imageEntity = this.imageRepo.create({
                            imageUrl: result.secure_url,
                            publicId: result.public_id,
                            label,
                            employee: saved,
                        });

                        await this.imageRepo.save(imageEntity);
                        this.logger.log(`✅ تم حفظ الصورة في الجدول المنفصل: ${label}`);
                        uploadedImagesCount++;
                    }

                } catch (error: unknown) {
                    const errMsg = error instanceof Error && typeof error.message === 'string'
                        ? error.message
                        : 'Unknown error';
                    const fileName = typeof file.originalname === 'string' ? file.originalname : 'غير معروف';
                    this.logger.error(`💥 فشل رفع صورة ${fileName}: ${errMsg}`);
                }
            })
        );
        this.logger.log(`✅ انتهت معالجة المجموعة ${batchIndex + 1}`);
    }

    this.logger.log(`📊 إجمالي الصور المرفوعة: ${uploadedImagesCount}`);

    // الصورة الافتراضية إذا لم توجد صورة شخصية
    if (!saved.profileImageUrl) {
        this.logger.log(`👤 استخدام الصورة الافتراضية للملف الشخصي`);
        saved.profileImageUrl = 'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
        await this.employeeRepo.update(saved.id, { profileImageUrl: saved.profileImageUrl });
    }

    // إنشاء بطاقة الموظف
    this.logger.log(`🎴 جاري إنشاء بطاقة الموظف...`);
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

    this.logger.log(`✅ تم إنشاء البطاقة: ${cardUrl}`);

    // تحديث بيانات الموظف النهائية
    this.logger.log(`🔄 جاري تحديث بيانات الموظف النهائية...`);
    saved.cardUrl = cardUrl;
    saved.designId = designId;
    saved.qrCode = qrCode;
    saved = await this.employeeRepo.save(saved);

    this.logger.log(`🎉 تم إنشاء الموظف بنجاح للشركة: ${companyId}`);
    this.logger.log(`========================================`);
    this.logger.log(`📊 ملخص إنشاء الموظف:`);
    this.logger.log(`   👤 الاسم: ${saved.name}`);
    this.logger.log(`   🆔 الرقم: ${saved.id}`);
    this.logger.log(`   🎴 رابط البطاقة: ${saved.cardUrl}`);
    this.logger.log(`   🖼️ الصور المرفوعة: ${uploadedImagesCount}`);
    this.logger.log(`   🎨 صورة الخلفية: ${backgroundImageUrl ? 'نعم' : 'لا'}`);
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
 
  async update(id: number, dto: UpdateEmployeeDto, files?: Express.Multer.File[]) {
    const employee = await this.employeeRepo.findOne({
      where: { id },
      relations: ['company', 'cards', 'images'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    let workingHours: Record<string, { from: string; to: string }> | null = null;
    let isOpen24Hours = false;
    let showWorkingHours = dto.showWorkingHours ?? employee.showWorkingHours ?? false;

    if (showWorkingHours) {
      if (dto.isOpen24Hours) {
        isOpen24Hours = true;
      } else if (dto.workingHours && Object.keys(dto.workingHours).length > 0) {
        workingHours = dto.workingHours;
      } else {
        showWorkingHours = false;
      }
    }

    Object.assign(employee, {
      ...dto,
      showWorkingHours,
      isOpen24Hours,
      workingHours,
      cardStyleSection: dto.cardStyleSection ?? employee.cardStyleSection,
      videoType: allowedVideoTypes.includes(dto.videoType as VideoType)
      ? dto.videoType
      : employee.videoType,
      contactFormDisplayType: allowedContactFormDisplayTypes.includes(dto.contactFormDisplayType as ContactFormDisplayType)
      ? dto.contactFormDisplayType
      : employee.contactFormDisplayType,
      contactFieldType: allowedContactFieldTypes.includes(dto.contactFieldType as ContactFieldType)
      ? dto.contactFieldType
      : employee.contactFieldType,
      feedbackIconType: allowedFeedbackIconTypes.includes(dto.feedbackIconType as FeedbackIconType)
      ? dto.feedbackIconType
      : employee.feedbackIconType,
    });

    const imageMap = {
      profileImage: 'profileImageUrl',
      secondaryImage: 'secondaryImageUrl',
      facebookImage: 'facebookImageUrl',
      instagramImage: 'instagramImageUrl',
      tiktokImage: 'tiktokImageUrl',
      snapchatImage: 'snapchatImageUrl',
      xImage: 'xImageUrl',
      linkedinImage: 'linkedinImageUrl',
      customImage: 'customImageUrl',
      testimonialImage: 'testimonialImageUrl',
      workingHoursImage: 'workingHoursImageUrl',
      contactFormHeaderImage: 'contactFormHeaderImageUrl',
      pdfThumbnail: 'pdfThumbnailUrl',
      workLinkImage: 'workLinkImageUrl',
      workLinkkImage: 'workLinkkImageUrl',
      workLinkkkImage: 'workLinkkkImageUrl',
      workLinkkkkImage: 'workLinkkkkImageUrl',
      workLinkkkkkImage: 'workLinkkkkkImageUrl',
    } as const;

    files = Array.isArray(files) ? files : [];

    function chunkArray<T>(array: T[], size: number): T[][] {
      const result: T[][] = [];
      for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
      }
      return result;
    }

    const batches = chunkArray(files, 3);

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(async (file) => {
          try {
            if (!file || !file.buffer || !(file.buffer instanceof Buffer)) {
              throw new BadRequestException('الملف غير صالح أو لا يحتوي على buffer');
            }

            const imageProcessor = sharp(file.buffer);
            const resized = imageProcessor.resize({ width: 800 });
            const formatted = resized.webp({ quality: 70 });
            const compressedBuffer = await formatted.toBuffer();
            const compressedFile = {
              ...file,
              buffer: compressedBuffer,
            };

            const result = await this.cloudinaryService.uploadImage(
              compressedFile,
              `companies/${employee.company.id}/employees`
            );

            const field = imageMap[file.fieldname as keyof typeof imageMap];
            if (field) {
              Object.assign(employee, { [field]: result.secure_url });
            } else {
              const label =
              typeof file.originalname === 'string'
              ? file.originalname.split('.')[0]
              : 'image';

              const imageEntity = this.imageRepo.create({
                imageUrl: result.secure_url,
                publicId: result.public_id,
                label,
                employee,
              });

              await this.imageRepo.save(imageEntity);
            }
          } catch (error: unknown) {
            const errMsg =
            error instanceof Error && typeof error.message === 'string'
            ? error.message
            : 'Unknown error'; 
            const fileName =
            typeof file.originalname === 'string' ? file.originalname : 'غير معروف';
            this.logger.warn(`فشل رفع صورة ${fileName}: ${errMsg}`);
          }
        })
      );
    }

    if (!employee.profileImageUrl) {
      employee.profileImageUrl =
      'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
    }

    let saved = await this.employeeRepo.save(employee);

    if (
      dto.name ||
      dto.jobTitle ||
      dto.designId ||
      dto.isOpen24Hours !== undefined ||
      dto.showWorkingHours !== undefined ||
      dto.workingHours
    ) {
      const { cardUrl, designId } = await this.cardService.generateCard(
        saved,
        dto.designId || saved.designId,
        dto.qrStyle ?? saved.qrStyle,
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
          cardStyleSection: dto.cardStyleSection,
        }
      );
      saved.cardUrl = cardUrl;
      saved.designId = designId;
      saved = await this.employeeRepo.save(saved);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'تم تحديث الموظف بنجاح',
      data: saved,
    };
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByUniqueUrl(uniqueUrl: string, source = 'link', req?: Request) {
    const card = await this.cardRepo.findOne({
      where: { uniqueUrl },
      relations: ['employee', 'employee.company', 'employee.images'],
    });

    if (!card || !card.employee) {
      throw new NotFoundException(' البطاقة غير موجودة');
    }

    const { employee } = card;
    let qrCode = card.qrCode;
    if (!qrCode) {
      const { qrCode: generatedQr } = await this.cardService.generateCard(employee, card.designId);
      qrCode = generatedQr;
    }
    void req;
    return {
      statusCode: HttpStatus.OK,
      message: ' تم جلب بيانات البطاقة بنجاح',
      data: {
        ...employee,
        qrCode,
      },
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
        'profileImageUrl', 'secondaryImageUrl', 'facebook', 'facebookTitle','facebookSubtitle','facebookImageUrl',
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
): Promise<{ count: number; imported: Employee[]; skipped: string[]; limitReached: boolean }> {
  this.logger.log(`📁 بدء استيراد ملف Excel: ${filePath} للشركة: ${companyId}`);
  
  const workbook = new ExcelJS.Workbook();
  
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Employees');
  if (!sheet) {
    this.logger.error('❌ شيت "Employees" غير موجود في الملف');
    throw new Error('شيت "Employees" غير موجود');
  }

  this.logger.log(`📊 عدد الصفوف في الشيت: ${sheet.rowCount}`);

  const company = await this.companyRepo.findOne({ where: { id: companyId } });
  if (!company) {
    this.logger.error(`❌ الشركة غير موجودة: ${companyId}`);
    throw new Error('الشركة غير موجودة');
  }

  this.logger.log(`🔍 جاري حساب عدد الموظفين الحاليين...`);
  const currentEmployeeCount = await this.employeeRepo.count({ 
    where: { company: { id: companyId } } 
  });
  this.logger.log(`👥 عدد الموظفين الحاليين: ${currentEmployeeCount}`);

  this.logger.log(`🔍 جاري التحقق من الحد المسموح في الخطة...`);
  const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
  this.logger.log(`📋 الحد المسموح في الخطة: ${allowedCount}`);

  const availableSlots = allowedCount - currentEmployeeCount;
  this.logger.log(`🎯 العدد الفاضل للإضافة: ${availableSlots}`);

  if (availableSlots <= 0) {
    this.logger.warn(`⚠️ لا يوجد أماكن فارغة - العدد الفاضل: ${availableSlots}`);
  }

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
  
  this.logger.log(`📝 العناوين الموجودة في الشيت: ${headers.join(', ')}`);

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

  this.logger.log(`🔄 بدء معالجة الصفوف من 2 إلى ${sheet.rowCount}...`);

  for (let i = 2; i <= sheet.rowCount; i++) {
    this.logger.log(`--- معالجة الصف ${i} ---`);

    // التحقق من الوصول للحد
    if (imported.length >= availableSlots) {
      const skipMsg = `Row ${i} skipped: تم الوصول للحد الأقصى (${availableSlots} موظف)`;
      this.logger.warn(`⏹️ ${skipMsg}`);
      skipped.push(skipMsg);
      limitReached = true;
      continue;
    }

    const row = sheet.getRow(i);
    if (!row || row.cellCount === 0) {
      const skipMsg = `Row ${i} skipped: صف فارغ`;
      this.logger.warn(`📭 ${skipMsg}`);
      skipped.push(skipMsg);
      continue;
    }

    this.logger.log(`🔍 فحص بيانات الصف ${i}...`);

    const rowData: Record<string, string | number | null> = {};

    headers.forEach((col, index) => {
      if (!col) return;
      const normalizedCol = col.trim().toLowerCase();
      const mappedCol = columnMapping[normalizedCol] || normalizedCol;
      const entityIndex = normalizedEntityColumns.indexOf(mappedCol.toLowerCase());
      if (entityIndex === -1) {
        this.logger.debug(`❌ العمود "${col}" غير معروف - تم تخطيه`);
        return;
      }
      const actualEntityKey = entityColumns[entityIndex];
      const cellValue = normalize(row.getCell(index + 1).value);
      rowData[actualEntityKey] = cellValue;
      this.logger.debug(`📋 ${actualEntityKey}: ${cellValue}`);
    });

    if (!rowData['name']) {
      const skipMsg = `Row ${i} skipped: يجب إضافة اسم`;
      this.logger.warn(`🚫 ${skipMsg}`);
      skipped.push(skipMsg);
      continue;
    }

    this.logger.log(`✅ الصف ${i} يحتوي على اسم: "${rowData['name']}" - جاري المحاولة...`);

    try {
      // معالجة الصور
      const imageFields = Object.keys(rowData).filter(key =>
        key.toLowerCase().includes('imageurl') ||
        key.toLowerCase().includes('image') ||
        key.toLowerCase().includes('thumbnail')
      );

      this.logger.log(`🖼️ حقول الصور الموجودة: ${imageFields.join(', ')}`);

      for (const field of imageFields) {
        const imgUrl = rowData[field] ? String(rowData[field]).trim() : null;
        const isProfile = field === 'profileImageUrl';

        if (imgUrl && imgUrl.startsWith('http')) {
          this.logger.log(`🌐 صورة ${field}: ${imgUrl}`);
          rowData[field] = imgUrl;
        } else if (isProfile && (!imgUrl || imgUrl === '')) {
          rowData[field] = 'https://res.cloudinary.com/dk3wwuy5d/image/upload/v1761151124/default-profile_jgtihy.jpg';
          this.logger.log(`👤 استخدام الصورة الافتراضية للملف الشخصي`);
        } else {
          rowData[field] = null;
          this.logger.log(`❌ صورة ${field}: غير صالحة`);
        }
      }

      // تنظيف البيانات
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
        this.logger.log(`📧 إنشاء إيميل افتراضي: ${finalData['email']}`);
      }

      this.logger.log(`💾 جاري حفظ الموظف في قاعدة البيانات...`);
      const employee = this.employeeRepo.create(finalData);
      const saved = await this.employeeRepo.save(employee);
      this.logger.log(`✅ تم حفظ الموظف: ${saved.name} (ID: ${saved.id})`);

      this.logger.log(`🎴 جاري إنشاء بطاقة الموظف...`);
      const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved);
      saved.cardUrl = cardUrl;
      saved.qrCode = qrCode;
      if (!saved.designId) saved.designId = designId;

      await this.employeeRepo.save(saved);
      imported.push(saved);

      this.logger.log(`🎉 تم إضافة ${saved.name} بنجاح (${imported.length}/${availableSlots})`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      const skipMsg = `Row ${i} skipped: خطأ في الحفظ: ${msg}`;
      this.logger.error(`💥 ${skipMsg}`);
      skipped.push(skipMsg);
    }
  }

  this.logger.log(`========================================`);
  this.logger.log(`🎯 نتيجة الاستيراد النهائية:`);
  this.logger.log(`   ✅ تم إضافة: ${imported.length} موظف`);
  this.logger.log(`   ⏹️ تم تخطي: ${skipped.length} صف`);
  this.logger.log(`   📊 الوصول للحد: ${limitReached ? 'نعم' : 'لا'}`);
  this.logger.log(`   👥 الإجمالي بعد الاستيراد: ${currentEmployeeCount + imported.length}/${allowedCount}`);
  this.logger.log(`========================================`);
  
  return { 
    count: imported.length, 
    imported, 
    skipped,
    limitReached 
  };
}

}