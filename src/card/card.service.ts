import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Employee } from '../employee/entities/employee.entity';
import { randomUUID } from 'crypto';
import QRCodeImport from 'qrcode';
import { VisitService } from '../visit/visit.service';

type QRCodeOptions = {
  color?: {
    dark?: string;
    light?: string;
  };
  margin?: number;
  scale?: number;
};

const QRCode = QRCodeImport as {
  toDataURL: (text: string, options?: QRCodeOptions) => Promise<string>;
};

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
): Promise<{ cardUrl: string; qrCode: string; designId: string; qrStyle: number }> {
  const finalDesignId = designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';
  const finalQrStyle = qrStyle ?? 1;

  let card = await this.cardRepo.findOne({
    where: { employeeId: employee.id }
  });

  let uniqueUrl: string;
  
  if (card && card.uniqueUrl) {
    uniqueUrl = card.uniqueUrl;
  } else {
    uniqueUrl = randomUUID();
  }

  const cardUrl = `https://sharke1.netlify.app/${uniqueUrl}`;

  let qrCode: string;

  switch (finalQrStyle) {
    case 2:
      qrCode = await QRCode.toDataURL(cardUrl, {
        color: { dark: '#FF0000', light: '#FFFFFF' },
      });
      break;
    case 3:
      qrCode = await QRCode.toDataURL(cardUrl, {
        margin: 4,
        scale: 10,
      });
      break;
    default:
      qrCode = await QRCode.toDataURL(cardUrl);
      if (![1, 2, 3].includes(finalQrStyle)) {
        this.logger.warn(` qrStyle غير معروف (${finalQrStyle})، تم استخدام الشكل العادي`);
      }
      break;
  }

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

  let finalBackgroundImage: string | null;
  
  if (extra?.backgroundImage !== undefined) {
    finalBackgroundImage = extra.backgroundImage;
  } else if (currentBackgroundImage !== undefined) {
    finalBackgroundImage = currentBackgroundImage;
  } else {
    finalBackgroundImage = null;
  }

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
    
    backgroundImage: finalBackgroundImage,
  };


  if (card) {
    Object.assign(card, cardData);
    await this.cardRepo.save(card);
  } else {
    card = this.cardRepo.create(cardData);
    await this.cardRepo.save(card);
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
): Promise<{ cardUrl: string; qrCode: string; designId: string; qrStyle: number }> {
  const existingCard = await this.cardRepo.findOne({
    where: { employeeId: employee.id }
  });

  if (existingCard) {
    const finalDesignId = designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';
    const finalQrStyle = qrStyle ?? 1;
  
    const cardUrl = `https://sharke1.netlify.app/${existingCard.uniqueUrl}`;
    
    let qrCode: string;
    switch (finalQrStyle) {
      case 2:
        qrCode = await QRCode.toDataURL(cardUrl, {
          color: { dark: '#FF0000', light: '#FFFFFF' },
        });
        break;
      case 3:
        qrCode = await QRCode.toDataURL(cardUrl, {
          margin: 4,
          scale: 10,
        });
        break;
      default:
        qrCode = await QRCode.toDataURL(cardUrl);
        break;
    }

    let finalBackgroundImage: string | null;
    
    if (extra?.backgroundImage !== undefined) {
      finalBackgroundImage = extra.backgroundImage;
    } else {
      finalBackgroundImage = existingCard.backgroundImage;
    }

    const updateData: Partial<EmployeeCard> = {
      qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      fontColorHead: extra?.fontColorHead ?? existingCard.fontColorHead,
      fontColorHead2: extra?.fontColorHead2 ?? existingCard.fontColorHead2,
      fontColorParagraph: extra?.fontColorParagraph ?? existingCard.fontColorParagraph,
      fontColorExtra: extra?.fontColorExtra ?? existingCard.fontColorExtra,
      sectionBackground: extra?.sectionBackground ?? existingCard.sectionBackground,
      Background: extra?.Background ?? existingCard.Background,
      sectionBackground2: extra?.sectionBackground2 ?? existingCard.sectionBackground2,
      dropShadow: extra?.dropShadow ?? existingCard.dropShadow,
      shadowX: extra?.shadowX ?? existingCard.shadowX,
      shadowY: extra?.shadowY ?? existingCard.shadowY,
      shadowBlur: extra?.shadowBlur ?? existingCard.shadowBlur,
      shadowSpread: extra?.shadowSpread ?? existingCard.shadowSpread,
      cardRadius: extra?.cardRadius ?? existingCard.cardRadius,
      cardStyleSection: extra?.cardStyleSection ?? existingCard.cardStyleSection,
      backgroundImage: finalBackgroundImage,
    };


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