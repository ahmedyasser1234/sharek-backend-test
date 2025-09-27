import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from '../employee/entities/employee-card.entity';

@Controller('card')
export class CardController {
  private readonly logger = new Logger(CardController.name);

  constructor(
    @InjectRepository(EmployeeCard)
    private readonly cardRepo: Repository<EmployeeCard>,
  ) {}

  @Get(':uniqueUrl')
  async renderCard(@Param('uniqueUrl') uniqueUrl: string) {
    this.logger.debug(`🔗 محاولة جلب بطاقة بالرابط الفريد: ${uniqueUrl}`);

    const card = await this.cardRepo.findOne({
      where: { uniqueUrl },
      relations: ['employee', 'employee.company', 'employee.images'],
    });

    if (!card || !card.employee) {
      this.logger.warn(`❌ البطاقة غير موجودة أو لا تحتوي على موظف: ${uniqueUrl}`);
      throw new NotFoundException('❌ البطاقة غير موجودة');
    }

    const design = card.designId || 'classic';
    const employee = card.employee;

    this.logger.log(`✅ تم تحميل البطاقة للموظف: ${employee.name} | التصميم: ${design}`);

    const employeeData = {
      name: employee.name,
      jobTitle: employee.jobTitle,
      email: employee.conemail,
      phone: employee.conphone,
      location: employee.location,
      locationTitle: employee.locationTitle,
      profileImageUrl: employee.profileImageUrl || null,
      secondaryImageUrl: employee.secondaryImageUrl || null,
      facebookImageUrl: employee.facebookImageUrl || null,
      instagramImageUrl: employee.instagramImageUrl || null,
      tiktokImageUrl: employee.tiktokImageUrl || null,
      snapchatImageUrl: employee.snapchatImageUrl || null,
      facebook: employee.facebook || null,
      instagram: employee.instagram || null,
      tiktok: employee.tiktok || null,
      snapchat: employee.snapchat || null,
      workLink: employee.workLink || null,
      productsLink: employee.productsLink || null,
      qrCode: card.qrCode || null,
      cardUrl: employee.cardUrl || null,
      company: employee.company || null,
      images: employee.images?.map((img) => img.imageUrl) || [],
    };

    return {
      message: '✅ تم تحميل البطاقة بنجاح',
      data: {
        design,
        employee: employeeData,
      },
    };
  }
}
