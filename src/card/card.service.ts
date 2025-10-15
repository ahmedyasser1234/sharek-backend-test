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

    const finalDesignId =
      designId || employee.designId || employee.company?.defaultDesignId || 'card-dark';

    const uniqueUrl = randomUUID();
    const cardUrl = `http://localhost:4000/${finalDesignId}/${uniqueUrl}`;

    const qrCode = await QRCode.toDataURL(cardUrl);

    const card = this.cardRepo.create({
      title: `${employee.name} - ${employee.jobTitle} - بطاقة الموظف`,
      uniqueUrl,
      qrCode,
      designId: finalDesignId,
      employee,
    });

    await this.cardRepo.save(card);
    return { cardUrl, qrCode, designId: finalDesignId };
  }
}
