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

    const cardData: Partial<EmployeeCard> = {
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl,
      qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      employeeId: employee.id, 
      employee, 
    };

    if (extra) {
      Object.assign(cardData, extra);
    }

    const card = this.cardRepo.create(cardData);
    await this.cardRepo.save(card);
    
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
      where: { employee: { id: employee.id } }
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
      };

      if (extra) {
        Object.assign(updateData, extra);
      }

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