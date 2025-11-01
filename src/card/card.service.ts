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
    const uniqueUrl = randomUUID();
    const cardUrl = `https://sharke1.netlify.app/${finalDesignId}/${uniqueUrl}`;

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
          this.logger.warn(`qrStyle غير معروف (${finalQrStyle})، تم استخدام الشكل العادي`);
        }
        break;
    }

    if (!employee.id) {
      this.logger.error(' لا يمكن إنشاء البطاقة: employee.id غير موجود');
      throw new Error('employee.id مطلوب لإنشاء البطاقة');
    }

    let card = await this.cardRepo.findOne({
      where: { employeeId: employee.id }
    });

    const cardData: Partial<EmployeeCard> = {
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl,
      qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      employeeId: employee.id,
      fontColorHead: extra?.fontColorHead || '#000000',
      fontColorHead2: extra?.fontColorHead2 || '#000000',
      fontColorParagraph: extra?.fontColorParagraph || '#000000',
      fontColorExtra: extra?.fontColorExtra || '#000000',
      sectionBackground: extra?.sectionBackground || '#ffffff',
      Background: extra?.Background || '#ffffff',
      sectionBackground2: extra?.sectionBackground2 || '#ffffff',
      dropShadow: extra?.dropShadow || '#000000',
      shadowX: extra?.shadowX ?? 1,
      shadowY: extra?.shadowY ?? 1,
      shadowBlur: extra?.shadowBlur ?? 3,
      shadowSpread: extra?.shadowSpread ?? 1,
      cardRadius: extra?.cardRadius ?? 16,
      cardStyleSection: extra?.cardStyleSection ?? false,
      backgroundImage: extra?.backgroundImage || null,
    };

    if (extra) {
      Object.assign(cardData, extra);
    }

    if (card) {
      Object.assign(card, cardData);
      await this.cardRepo.save(card);
      this.logger.log(` تم تحديث الكارد الموجود للموظف: ${employee.id}`);
    } else {
      card = this.cardRepo.create(cardData);
      await this.cardRepo.save(card);
      this.logger.log(` تم إنشاء كارد جديد للموظف: ${employee.id}`);
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
    
      let qrCode: string;
      switch (finalQrStyle) {
        case 2:
          qrCode = await QRCode.toDataURL(existingCard.uniqueUrl, {
            color: { dark: '#FF0000', light: '#FFFFFF' },
          });
          break;
        case 3:
          qrCode = await QRCode.toDataURL(existingCard.uniqueUrl, {
            margin: 4,
            scale: 10,
          });
          break;
        default:
          qrCode = await QRCode.toDataURL(existingCard.uniqueUrl);
          break;
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
        backgroundImage: extra?.backgroundImage ?? existingCard.backgroundImage,
      };

      this.logger.log(` تم تحديث بطاقة الموظف ${employee.id} بالخصائص:`, {
        shadowX: updateData.shadowX,
        shadowY: updateData.shadowY,
        shadowBlur: updateData.shadowBlur,
        shadowSpread: updateData.shadowSpread,
        cardRadius: updateData.cardRadius,
        cardStyleSection: updateData.cardStyleSection
      });

      Object.assign(existingCard, updateData);
      await this.cardRepo.save(existingCard);

      const cardUrl = `https://sharke1.netlify.app/${finalDesignId}/${existingCard.uniqueUrl}`;

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