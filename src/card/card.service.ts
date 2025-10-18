import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Employee } from '../employee/entities/employee.entity';
import { randomUUID } from 'crypto';
import QRCodeImport from 'qrcode';

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
  ) {}

  async generateCard(
    employee: Employee,
    designId?: string,
    qrStyle?: number,
  ): Promise<{ cardUrl: string; qrCode: string; designId: string; qrStyle: number }> {
    const finalDesignId =
      designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';

    const finalQrStyle = qrStyle ?? 1;
    const uniqueUrl = randomUUID();
    const cardUrl = `http://localhost:4000/${finalDesignId}/${uniqueUrl}`;

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

    const card = this.cardRepo.create({
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl,
      qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
      employee,
    });

    await this.cardRepo.save(card);

    return {
      cardUrl,
      qrCode,
      designId: finalDesignId,
      qrStyle: finalQrStyle,
    };
  }
}
