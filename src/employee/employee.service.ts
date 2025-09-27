import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpStatus,
  Logger,
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
  ) {}

  async create(dto: CreateEmployeeDto, companyId: string, files: Express.Multer.File[]) {
  this.logger.log(`🆕 بدء إنشاء موظف جديد للشركة: ${companyId}`);

  const company = await this.companyRepo.findOne({ where: { id: companyId } });
  if (!company) throw new NotFoundException('Company not found');

  const currentCount = await this.employeeRepo.count({ where: { company: { id: companyId } } });
  const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
  if (currentCount >= allowedCount) throw new ForbiddenException('الخطة لا تسمح بإضافة موظفين جدد');

  const existingEmployee = await this.employeeRepo.findOne({ where: { email: dto.email } });
  if (existingEmployee) throw new BadRequestException('❌ هذا الإيميل مستخدم بالفعل لموظف آخر');

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


  const employee = this.employeeRepo.create(employeeData);
  let saved = await this.employeeRepo.save(employee);
  this.logger.log(`✅ تم حفظ الموظف: ${saved.id}`);

  const imageMap = {
    profileImage: 'profileImageUrl',
    secondaryImage: 'secondaryImageUrl',
    facebookImage: 'facebookImageUrl',
    instagramImage: 'instagramImageUrl',
    tiktokImage: 'tiktokImageUrl',
    snapchatImage: 'snapchatImageUrl',
    customImage: 'customImageUrl',
    testimonialImage: 'testimonialImageUrl',
    workingHoursImage: 'workingHoursImageUrl',
    contactFormHeaderImage: 'contactFormHeaderImageUrl',
    pdfThumbnail: 'pdfThumbnailUrl',
  } as const;

  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const companyFolder = companyId;

  for (const file of files) {
    const field = imageMap[file.fieldname as keyof typeof imageMap];
    const imageUrl = `${baseUrl}/uploads/${companyFolder}/${encodeURIComponent(file.filename)}`;
    this.logger.debug(`📤 رفع صورة: ${file.originalname} → ${imageUrl}`);

    if (field) {
      Object.assign(saved, { [field]: imageUrl });
    } else {
      const label = file.originalname.split('.')[0];
      const imageEntity = this.imageRepo.create({ imageUrl, label, employee: saved });
      await this.imageRepo.save(imageEntity);
    }
  }

  if (!saved.profileImageUrl) {
    saved.profileImageUrl = `${baseUrl}/uploads/defaults/default-profile.jpg`;
    this.logger.debug(`🖼️ تعيين صورة افتراضية للبروفايل`);
  }

  saved = await this.employeeRepo.save(saved);

  const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved, dto.designId);
  saved.cardUrl = cardUrl;
  saved.designId = designId;
  await this.employeeRepo.save(saved);

  return {
    statusCode: HttpStatus.CREATED,
    message: '✅ تم إنشاء الموظف بنجاح',
    data: { ...saved, qrCode },
  };
 }

  async findAll(companyId: string, page = 1, limit = 10, search?: string) {
    this.logger.debug(`📄 جلب الموظفين للشركة: ${companyId} | صفحة: ${page} | بحث: ${search || 'لا يوجد'}`);

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

    query.skip((page - 1) * limit).take(limit);

    const [employees, total] = await query.getManyAndCount();

    const data = await Promise.all(
      employees.map(async (emp) => ({
        ...emp,
        qrCode: emp.cards?.[0]?.qrCode || '',
        visitsCount: await this.visitService.getVisitCount(emp.id),
      })),
    );

    this.logger.log(`✅ تم جلب ${data.length} موظف`);
    return {
      statusCode: HttpStatus.OK,
      message: '✅ تم جلب الموظفين بنجاح',
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    this.logger.debug(`🔍 جلب موظف بالمعرف: ${id}`);
    const employee = await this.employeeRepo.findOne({
      where: { id },
      relations: ['company', 'cards', 'images'],
    });
    if (!employee) {
      this.logger.warn(`❌ الموظف غير موجود: ${id}`);
      throw new NotFoundException('Employee not found');
    }

    this.logger.log(`✅ تم جلب بيانات الموظف: ${employee.id}`);
    return {
      statusCode: HttpStatus.OK,
      message: '✅ تم جلب بيانات الموظف بنجاح',
      data: employee,
    };
  }

  async update(id: number, dto: UpdateEmployeeDto, files?: Express.Multer.File[]) {
  this.logger.log(`✏️ بدء تحديث الموظف: ${id}`);

  const employee = await this.employeeRepo.findOne({
    where: { id },
    relations: ['company', 'cards', 'images'],
  });

  if (!employee) throw new NotFoundException('Employee not found');

  // ✅ مواعيد العمل
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
    videoType: allowedVideoTypes.includes(dto.videoType as VideoType) ? dto.videoType : employee.videoType,
    contactFormDisplayType: allowedContactFormDisplayTypes.includes(dto.contactFormDisplayType as ContactFormDisplayType) ? dto.contactFormDisplayType : employee.contactFormDisplayType,
    contactFieldType: allowedContactFieldTypes.includes(dto.contactFieldType as ContactFieldType) ? dto.contactFieldType : employee.contactFieldType,
    feedbackIconType: allowedFeedbackIconTypes.includes(dto.feedbackIconType as FeedbackIconType) ? dto.feedbackIconType : employee.feedbackIconType,
  });

  // ✅ رفع الصور
  if (files && files.length > 0) {
    const imageMap = {
      profileImage: 'profileImageUrl',
      secondaryImage: 'secondaryImageUrl',
      facebookImage: 'facebookImageUrl',
      instagramImage: 'instagramImageUrl',
      tiktokImage: 'tiktokImageUrl',
      snapchatImage: 'snapchatImageUrl',
      customImage: 'customImageUrl',
      testimonialImage: 'testimonialImageUrl',
      workingHoursImage: 'workingHoursImageUrl',
      contactFormHeaderImage: 'contactFormHeaderImageUrl',
      pdfThumbnail: 'pdfThumbnailUrl',
    } as const;

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const companyFolder = employee.company.id;

    for (const file of files) {
      const field = imageMap[file.fieldname as keyof typeof imageMap];
      const imageUrl = `${baseUrl}/uploads/${companyFolder}/${encodeURIComponent(file.filename)}`;
      this.logger.debug(`📤 تحديث صورة: ${file.originalname} → ${imageUrl}`);

      if (field) {
        Object.assign(employee, { [field]: imageUrl });
      } else {
        const label = file.originalname.split('.')[0];
        const imageEntity = this.imageRepo.create({ imageUrl, label, employee });
        await this.imageRepo.save(imageEntity);
      }
    }
  }

  if (!employee.profileImageUrl) {
    employee.profileImageUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}/uploads/defaults/default-profile.jpg`;
    this.logger.debug(`🖼️ تعيين صورة افتراضية للبروفايل`);
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
    const { cardUrl, designId } = await this.cardService.generateCard(saved, dto.designId || saved.designId);
    saved.cardUrl = cardUrl;
    saved.designId = designId;
    saved = await this.employeeRepo.save(saved);
  }

  this.logger.log(`✅ تم تحديث الموظف: ${saved.id}`);

  return {
    statusCode: HttpStatus.OK,
    message: '✅ تم تحديث الموظف بنجاح',
    data: saved,
  };
  }



  async remove(id: number) {
  this.logger.warn(`🗑 بدء حذف الموظف: ${id}`);
  const employeeRes = await this.findOne(id);
  const employee = employeeRes.data;

  const card = await this.cardRepo.findOne({ where: { employee: { id } } });
  if (card) {
    await this.cardRepo.remove(card);
    this.logger.log(`🧾 تم حذف بطاقة الموظف: ${id}`);
  }

  const images = await this.imageRepo.find({ where: { employee: { id } } });
  if (images.length) {
    await this.imageRepo.remove(images);
    this.logger.log(`🖼️ تم حذف ${images.length} صورة مرتبطة بالموظف: ${id}`);
  }

  await this.employeeRepo.remove(employee);
  this.logger.log(`✅ تم حذف الموظف نهائيًا: ${id}`);

  return {
    statusCode: HttpStatus.OK,
    message: '✅ تم حذف الموظف بنجاح',
  };
  }

  async findByUniqueUrl(uniqueUrl: string, source = 'link', req?: Request) {
  this.logger.debug(`🔗 البحث عن موظف باستخدام الرابط الفريد: ${uniqueUrl} | المصدر: ${source}`);
  const card = await this.cardRepo.findOne({
    where: { uniqueUrl },
    relations: ['employee', 'employee.company', 'employee.images'],
  });

  if (!card || !card.employee) {
    this.logger.warn(`❌ البطاقة غير موجودة أو لا تحتوي على موظف: ${uniqueUrl}`);
    throw new NotFoundException('❌ البطاقة غير موجودة');
  }

  const { employee } = card;
  this.logger.log(`📦 تم العثور على الموظف: ${employee.id} من خلال الرابط`);
  this.logger.log(`📈 تم تسجيل زيارة للموظف: ${employee.id} من المصدر: ${source}`);

  let qrCode = card.qrCode;
  if (!qrCode) {
    this.logger.warn(`⚠️ البطاقة لا تحتوي على QR، سيتم توليد واحد جديد`);
    const { qrCode: generatedQr } = await this.cardService.generateCard(employee, card.designId);
    qrCode = generatedQr;
    this.logger.log(`✅ تم توليد QR جديد للموظف: ${employee.id}`);
  }
  void req;
  return {
    statusCode: HttpStatus.OK,
    message: '✅ تم جلب بيانات البطاقة بنجاح',
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
      'profileImageUrl', 'secondaryImageUrl', 'facebook', 'facebookImageUrl', 'instagram', 'instagramImageUrl',
      'tiktok', 'tiktokImageUrl', 'snapchat', 'snapchatImageUrl', 'customImageUrl', 'customImageTitle',
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
      'highRatingRedirectUrl', 'autoRedirectAfterSeconds', 'enableAutoRedirect', 'workLink', 'productsLink'
    ];

    sheet.columns = columns.map(col => ({
      header: col,
      key: col,
      width: 30,
    }));

   const safeStringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value); 
    } catch {
      return '[Unserializable Object]';
    }
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
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
    this.logger.error(`❌ فشل إنشاء ملف Excel: ${errorMessage}`);
    throw new Error('فشل إنشاء ملف Excel');
  }

  }

  async importFromExcel(
  filePath: string,
  companyId: string
): Promise<{ count: number; imported: Employee[]; skipped: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('Employees');
  if (!sheet) throw new Error('❌ شيت "Employees" غير موجود');

  const company = await this.companyRepo.findOne({ where: { id: companyId } });
  if (!company) throw new Error('❌ الشركة غير موجودة');

  const imported: Employee[] = [];
  const skipped: string[] = [];

  type ExcelCellObject = {
    text?: string;
    hyperlink?: string;
    richText?: { text: string }[];
  };

  const normalize = (
    value: ExcelJS.CellValue,
    columnName?: string
  ): string | number | undefined => {
    if (value === null || value === undefined) return undefined;

    const isImageField = columnName?.toLowerCase().includes('imageurl');
    const isUrlField = columnName?.toLowerCase().includes('url');

    if (typeof value === 'object' && value !== null) {
      const cellObj = value as ExcelCellObject;
      const rawText =
        cellObj.text ||
        cellObj.hyperlink ||
        (Array.isArray(cellObj.richText) ? cellObj.richText.map(t => t.text).join('') : '');

      return rawText?.trim() || undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      if (isImageField || isUrlField) return trimmed;
      return trimmed;
    }

    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';

    return undefined;
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
  };

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (!row || row.cellCount === 0) continue;

    const rowData: Record<string, string | number | undefined> = {};

    headers.forEach((col, index) => {
      if (!col) return;

      const normalizedCol = col.trim().toLowerCase();
      const mappedCol = columnMapping[normalizedCol] || normalizedCol;

      const entityIndex = normalizedEntityColumns.indexOf(mappedCol.toLowerCase());
      if (entityIndex === -1) return;

      const actualEntityKey = entityColumns[entityIndex];
      rowData[actualEntityKey] = normalize(row.getCell(index + 1).value, actualEntityKey);
    });

    console.log(`🔁 Row ${i} mapped data:`, rowData);

    if (!rowData['name'] || !rowData['email']) {
      skipped.push(`Row ${i} skipped: missing name/email`);
      continue;
    }

    const existing = await this.employeeRepo.findOne({ where: { email: String(rowData['email']) } });
    if (existing) {
      skipped.push(`Row ${i} skipped: duplicate email ${rowData['email']}`);
      continue;
    }

    const currentCount = await this.employeeRepo.count({ where: { company: { id: companyId } } });
    const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
    if (currentCount >= allowedCount) {
      skipped.push(`Row ${i} skipped: subscription limit reached`);
      continue;
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const imageFields = Object.keys(rowData).filter(key =>
        key.toLowerCase().includes('imageurl') ||
        key.toLowerCase().includes('image') ||
        key.toLowerCase().includes('thumbnail')
      );

      for (const field of imageFields) {
        const imgFileName = String(rowData[field]);
        if (!imgFileName || imgFileName === 'undefined') {
          if (field === 'profileImageUrl') {
            rowData[field] = '/uploads/defaults/default-profile.jpeg';
          }
          continue;
        }

        const localPath = path.join(`./uploads/companies/${companyId}`, imgFileName);
        if (fs.existsSync(localPath)) {
          rowData[field] = `/uploads/companies/${companyId}/${imgFileName}`;
        } else {
          skipped.push(`Row ${i} warning: image ${imgFileName} not found for field ${field}`);
          rowData[field] = field === 'profileImageUrl'
            ? '/uploads/defaults/default-profile.jpg'
            : undefined;
        }
      }

      const finalData = {
        ...rowData,
        name: String(rowData['name']),
        email: String(rowData['email']),
        company,
      };

      console.log(`🧬 Final data to be saved for row ${i}:`, finalData);

      const employee = this.employeeRepo.create(finalData);
      const saved = await this.employeeRepo.save(employee);

      const nullFields = Object.entries(saved)
        .filter(([_, value]) => value === null || value === undefined)
        .map(([key]) => key);

      if (nullFields.length) {
        console.log(`⚠️ Row ${i} fields saved as null/undefined:`, nullFields);
      }

      const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved);
      saved.cardUrl = cardUrl;
      saved.qrCode = qrCode;

      if (!saved.designId) {
        saved.designId = designId;
      }

      await this.employeeRepo.save(saved);
      imported.push(saved);
      console.log(`✅ Row ${i} imported successfully: ${rowData['email']}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      skipped.push(`Row ${i} skipped: save error: ${msg}`);
      console.error(`❌ Row ${i} save error:`, msg, rowData);
    }
  }

  console.log(`✅ Imported: ${imported.length}, Skipped: ${skipped.length}`);
  return { count: imported.length, imported, skipped };
  }

}
