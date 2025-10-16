import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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
import jwt from 'jsonwebtoken';
import { createEmployeePass } from '../wallet/passkit.adapter';


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
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const currentCount = await this.employeeRepo.count({ where: { company: { id: companyId } } });
    const allowedCount = await this.subscriptionService.getAllowedEmployees(companyId);
    if (currentCount >= allowedCount) {
      throw new ForbiddenException('الخطة لا تسمح بإضافة موظفين جدد');
    }
    /*
    const existingEmployee = await this.employeeRepo.findOne({ where: { email: dto.email } });
    if (existingEmployee) {
    throw new BadRequestException(' هذا الإيميل مستخدم بالفعل لموظف آخر');
    }
    */
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

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const companyFolder = companyId;
    files = Array.isArray(files) ? files : [];

    for (const file of files) {
      const field = imageMap[file.fieldname as keyof typeof imageMap];
      const imageUrl = `${baseUrl}/uploads/companies/${companyFolder}/${encodeURIComponent(file.filename)}`;
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
    }

    saved = await this.employeeRepo.save(saved);

    const { cardUrl, qrCode, designId, qrStyle } = await this.cardService.generateCard(
    saved,
    dto.designId,
    dto.qrStyle,
  );

  saved.cardUrl = cardUrl;
  saved.qrCode = qrCode;
  saved.designId = designId;
  saved.qrStyle = qrStyle;

  saved = await this.employeeRepo.save(saved);
    return {
      statusCode: HttpStatus.CREATED,
      message: ' تم إنشاء الموظف بنجاح',
      data: { saved },
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
      videoType: allowedVideoTypes.includes(dto.videoType as VideoType) ? dto.videoType : employee.videoType,
      contactFormDisplayType: allowedContactFormDisplayTypes.includes(dto.contactFormDisplayType as ContactFormDisplayType) ? dto.contactFormDisplayType : employee.contactFormDisplayType,
      contactFieldType: allowedContactFieldTypes.includes(dto.contactFieldType as ContactFieldType) ? dto.contactFieldType : employee.contactFieldType,
      feedbackIconType: allowedFeedbackIconTypes.includes(dto.feedbackIconType as FeedbackIconType) ? dto.feedbackIconType : employee.feedbackIconType,
    });

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

    return {
      statusCode: HttpStatus.OK,
      message: ' تم تحديث الموظف بنجاح',
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
        'workLinkkkkk','workLinkkkkkTitle','workLinkkkkkSubtitle','workLinkkkkkImageUrl'
        
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
  ): Promise<{ count: number; imported: Employee[]; skipped: string[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Employees');
    if (!sheet) throw new Error(' شيت "Employees" غير موجود');

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new Error(' الشركة غير موجودة');

    const imported: Employee[] = [];
    const skipped: string[] = [];

    type ExcelCellObject = { text?: string; hyperlink?: string; richText?: { text: string }[] };

    const normalize = (value: ExcelJS.CellValue): string | number | undefined => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'object' && value !== null) {
        const cellObj = value as ExcelCellObject;
        const rawText =
        cellObj.text ||
        cellObj.hyperlink ||
        (Array.isArray(cellObj.richText) ? cellObj.richText.map(t => t.text).join('') : '');
        return rawText?.trim() || undefined;
      }
      if (typeof value === 'string') return value.trim() || undefined;
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
      'profile image': 'profileImageUrl',
      'profileimageurl': 'profileImageUrl',
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
        rowData[actualEntityKey] = normalize(row.getCell(index + 1).value);
      });

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
          const imgFileName = String(rowData[field] ?? '').trim();
          const isProfile = field === 'profileImageUrl';
          const hasFileName = imgFileName !== '' && imgFileName !== 'undefined';

          const localPath = hasFileName ? path.join(`./uploads/companies/${companyId}`, imgFileName) : '';
          const fileExists = hasFileName && fs.existsSync(localPath);

          if (fileExists) {
            rowData[field] = `/uploads/companies/${companyId}/${imgFileName}`;
          } else if (isProfile) {
            rowData[field] = '/uploads/defaults/default-profile.jpg';
          } else {
            rowData[field] = undefined;
          }
        
          if (!fileExists && hasFileName) {
            skipped.push(`Row ${i} warning: image ${imgFileName} not found for field ${field}`);
          }
        }

        const finalData = {
          ...rowData,
          name: String(rowData['name']),
          email: String(rowData['email']),
          company,
        };

        const employee = this.employeeRepo.create(finalData);      
        const saved = await this.employeeRepo.save(employee);

        const { cardUrl, qrCode, designId } = await this.cardService.generateCard(saved);
        saved.cardUrl = cardUrl;
        saved.qrCode = qrCode;
        if (!saved.designId) saved.designId = designId;

        await this.employeeRepo.save(saved);
        imported.push(saved);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        skipped.push(`Row ${i} skipped: save error: ${msg}`);
      }
    }
 
    return { count: imported.length, imported, skipped };
  }

}