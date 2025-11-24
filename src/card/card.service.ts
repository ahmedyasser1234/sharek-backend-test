import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Employee } from '../employee/entities/employee.entity';
import { randomUUID } from 'crypto';
import { VisitService } from '../visit/visit.service';

@Injectable()
export class CardService {
  private readonly logger = new Logger(CardService.name);

  constructor(
    @InjectRepository(EmployeeCard)
    private readonly cardRepo: Repository<EmployeeCard>,
    private readonly visitService: VisitService,
  ) {}

  async generateCard(
    employee: Employee,
    designId?: string,
    qrStyle?: number,
    extra?: Partial<EmployeeCard>
  ): Promise<{ 
    cardUrl: string; 
    qrCode: string; 
    designId: string; 
    qrStyle: number 
  }> {
    const finalDesignId = designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';
    const finalQrStyle = qrStyle ?? 1;

    let card = await this.cardRepo.findOne({
      where: { employeeId: employee.id }
    });

    let uniqueUrl: string;
    
    if (card && card.uniqueUrl) {
      uniqueUrl = card.uniqueUrl;
      this.logger.log(`استخدام الـ uniqueUrl الحالي: ${uniqueUrl}`);
    } else {
      uniqueUrl = randomUUID();
      this.logger.log(`إنشاء uniqueUrl جديد: ${uniqueUrl}`);
    }

    const cardUrl = `https://sharke1.netlify.app/${finalDesignId}/${uniqueUrl}`;
    
    const qrCode = `https://sharke1.netlify.app/${finalDesignId}/${uniqueUrl}?source=qr`;

    this.logger.log(`رابط البطاقة العادي: ${cardUrl}`);
    this.logger.log(`رابط QR Code المميز: ${qrCode}`);

    if (!employee.id) {
      this.logger.error('لا يمكن إنشاء البطاقة: employee.id غير موجود');
      throw new Error('employee.id مطلوب لإنشاء البطاقة');
    }

    const currentBackgroundImage = card?.backgroundImage;
    const currentFontColorHead = card?.fontColorHead;
    const currentFontColorHead2 = card?.fontColorHead2;
    const currentFontColorParagraph = card?.fontColorParagraph;
    const currentFontColorExtra = card?.fontColorExtra;
    const currentSectionBackground = card?.sectionBackground;
    const currentBackground = card?.Background;
    const currentSectionBackground2 = card?.sectionBackground2;
    const currentDropShadow = card?.dropShadow;
    const currentShadowX = card?.shadowX;
    const currentShadowY = card?.shadowY;
    const currentShadowBlur = card?.shadowBlur;
    const currentShadowSpread = card?.shadowSpread;
    const currentCardRadius = card?.cardRadius;
    const currentCardStyleSection = card?.cardStyleSection;

    const cardData: Partial<EmployeeCard> = {
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl, 
      qrCode, 
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      employeeId: employee.id,
      
      fontColorHead: extra?.fontColorHead ?? currentFontColorHead ?? '#000000',
      fontColorHead2: extra?.fontColorHead2 ?? currentFontColorHead2 ?? '#000000',
      fontColorParagraph: extra?.fontColorParagraph ?? currentFontColorParagraph ?? '#000000',
      fontColorExtra: extra?.fontColorExtra ?? currentFontColorExtra ?? '#000000',
      sectionBackground: extra?.sectionBackground ?? currentSectionBackground ?? '#ffffff',
      Background: extra?.Background ?? currentBackground ?? '#ffffff',
      sectionBackground2: extra?.sectionBackground2 ?? currentSectionBackground2 ?? '#ffffff',
      dropShadow: extra?.dropShadow ?? currentDropShadow ?? '#000000',
      shadowX: extra?.shadowX ?? currentShadowX ?? 1,
      shadowY: extra?.shadowY ?? currentShadowY ?? 1,
      shadowBlur: extra?.shadowBlur ?? currentShadowBlur ?? 3,
      shadowSpread: extra?.shadowSpread ?? currentShadowSpread ?? 1,
      cardRadius: extra?.cardRadius ?? currentCardRadius ?? 16,
      cardStyleSection: extra?.cardStyleSection ?? currentCardStyleSection ?? false,
      
      backgroundImage: extra?.backgroundImage !== undefined ? extra.backgroundImage : currentBackgroundImage,
    };

    this.logger.log(`إعدادات البطاقة - backgroundImage: ${cardData.backgroundImage || 'سيتم الحفاظ على القيمة الحالية'}`);

    if (card) {
      Object.assign(card, cardData);
      await this.cardRepo.save(card);
      this.logger.log(`تم تحديث الكارد الموجود للموظف: ${employee.id}`);
    } else {
      card = this.cardRepo.create(cardData);
      await this.cardRepo.save(card);
      this.logger.log(`تم إنشاء كارد جديد للموظف: ${employee.id}`);
    }

    return {
      cardUrl,
      qrCode, 
      designId: finalDesignId,
      qrStyle: finalQrStyle,
    };
  }

 async updateCard(
  employee: Employee,
  designId?: string,
  qrStyle?: number,
  extra?: Partial<EmployeeCard>
): Promise<{ 
  cardUrl: string; 
  qrCode: string;
  designId: string; 
  qrStyle: number 
}> {
  const existingCard = await this.cardRepo.findOne({
    where: { employeeId: employee.id }
  });

  if (existingCard) {
    const currentUniqueUrl = existingCard.uniqueUrl;
    
    const finalDesignId = designId || existingCard.designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';
    const finalQrStyle = qrStyle ?? existingCard.qrStyle ?? 1;

    const cardUrl = `https://sharke1.netlify.app/${finalDesignId}/${currentUniqueUrl}`;
    const qrCode = `https://sharke1.netlify.app/${finalDesignId}/${currentUniqueUrl}?source=qr`;

    this.logger.log(`رابط البطاقة العادي (تحديث): ${cardUrl}`);
    this.logger.log(`رابط QR Code المميز (تحديث): ${qrCode}`);

    const updateData: Partial<EmployeeCard> = {
      uniqueUrl: currentUniqueUrl,
      qrCode: qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      fontColorHead: extra?.fontColorHead !== undefined ? extra.fontColorHead : existingCard.fontColorHead,
      fontColorHead2: extra?.fontColorHead2 !== undefined ? extra.fontColorHead2 : existingCard.fontColorHead2,
      fontColorParagraph: extra?.fontColorParagraph !== undefined ? extra.fontColorParagraph : existingCard.fontColorParagraph,
      fontColorExtra: extra?.fontColorExtra !== undefined ? extra.fontColorExtra : existingCard.fontColorExtra,
      sectionBackground: extra?.sectionBackground !== undefined ? extra.sectionBackground : existingCard.sectionBackground,
      Background: extra?.Background !== undefined ? extra.Background : existingCard.Background,
      sectionBackground2: extra?.sectionBackground2 !== undefined ? extra.sectionBackground2 : existingCard.sectionBackground2,
      dropShadow: extra?.dropShadow !== undefined ? extra.dropShadow : existingCard.dropShadow,
      shadowX: extra?.shadowX !== undefined ? extra.shadowX : existingCard.shadowX,
      shadowY: extra?.shadowY !== undefined ? extra.shadowY : existingCard.shadowY,
      shadowBlur: extra?.shadowBlur !== undefined ? extra.shadowBlur : existingCard.shadowBlur,
      shadowSpread: extra?.shadowSpread !== undefined ? extra.shadowSpread : existingCard.shadowSpread,
      cardRadius: extra?.cardRadius !== undefined ? extra.cardRadius : existingCard.cardRadius,
      cardStyleSection: extra?.cardStyleSection !== undefined ? extra.cardStyleSection : existingCard.cardStyleSection,
      backgroundImage: extra?.backgroundImage !== undefined ? extra.backgroundImage : existingCard.backgroundImage,
    };

    this.logger.log(`تم تحديث بطاقة الموظف ${employee.id} مع الحفاظ على الـ uniqueUrl: ${currentUniqueUrl}`);

    Object.assign(existingCard, updateData);
    await this.cardRepo.save(existingCard);

    return {
      cardUrl,
      qrCode, 
      designId: finalDesignId,
      qrStyle: finalQrStyle,
    };
  } else {
    return this.generateCard(employee, designId, qrStyle, extra);
  }
}
}