import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from '../employee/entities/employee-card.entity';
import { Employee } from '../employee/entities/employee.entity';
import { randomUUID } from 'crypto';
import QRCodeImport from 'qrcode';

const QRCode = QRCodeImport as { toDataURL: (text: string) => Promise<string> };

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
  ): Promise<{ cardUrl: string; qrCode: string; designId: string }> {
    this.logger.log(`🪪 بدء توليد بطاقة للموظف: ${employee.name}`);

    const finalDesignId =
      designId || employee.designId || employee.company?.defaultDesignId || 'classic';
    this.logger.debug(`🎨 التصميم المستخدم: ${finalDesignId}`);

    const uniqueUrl = randomUUID();
    const cardUrl = `http://localhost:4000/${finalDesignId}/${uniqueUrl}`;
    this.logger.debug(`🔗 رابط البطاقة الفريد: ${cardUrl}`);

    const qrCode = await QRCode.toDataURL(cardUrl);
    this.logger.log(`📸 تم توليد QR بنجاح`);

    const card = this.cardRepo.create({
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl,
      qrCode,
      designId: finalDesignId,
      employee,
    });

    await this.cardRepo.save(card);
    this.logger.log(`✅ تم حفظ البطاقة في قاعدة البيانات: ${card.id}`);

    return { cardUrl, qrCode, designId: finalDesignId };
  }
}
