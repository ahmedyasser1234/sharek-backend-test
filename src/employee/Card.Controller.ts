import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCard } from './entities/employee-card.entity';

@Controller('card')
export class CardController {
  private readonly logger = new Logger(CardController.name);

  constructor(
    @InjectRepository(EmployeeCard)
    private readonly cardRepo: Repository<EmployeeCard>,
  ) {}

  @Get(':uniqueUrl')
  async renderCard(@Param('uniqueUrl') uniqueUrl: string) {
    this.logger.log(` محاولة تحميل البطاقة: ${uniqueUrl}`);

    const card = await this.cardRepo.findOne({
      where: { uniqueUrl },
      relations: ['employee', 'employee.company', 'employee.images'],
    });

    if (!card || !card.employee) {
      throw new NotFoundException(' البطاقة غير موجودة');
    }

    const design = card.designId || 'classic';
    const employee = card.employee;

    const employeeData = {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      email: employee.conemail || employee.email,
      phone: employee.conphone || employee.phone,
      whatsapp: employee.whatsapp,
      location: employee.location,
      locationTitle: employee.locationTitle,
      profileImageUrl: employee.profileImageUrl || null,
      secondaryImageUrl: employee.secondaryImageUrl || null,
      facebook: employee.facebook,
      facebookTitle: employee.facebookTitle,
      facebookSubtitle: employee.facebookSubtitle,
      facebookImageUrl: employee.facebookImageUrl,
      instagram: employee.instagram,
      instgramTitle: employee.instgramTitle,
      instgramSubtitle: employee.instgramSubtitle,
      instagramImageUrl: employee.instagramImageUrl,
      tiktok: employee.tiktok,
      tiktokTitle: employee.tiktokTitle,
      tiktokSubtitle: employee.tiktokSubtitle,
      tiktokImageUrl: employee.tiktokImageUrl,
      snapchat: employee.snapchat,
      snapchatTitle: employee.snapchatTitle,
      snapchatSubtitle: employee.snapchatSubtitle,
      snapchatImageUrl: employee.snapchatImageUrl,
      x: employee.x,
      xTitle: employee.xTitle,
      xSubtitle: employee.xSubtitle,
      xImageUrl: employee.xImageUrl,
      linkedin: employee.linkedin,
      linkedinTitle: employee.linkedinTitle,
      linkedinSubtitle: employee.linkedinSubtitle,
      linkedinImageUrl: employee.linkedinImageUrl,
      workLink: employee.workLink,
      workLinkTitle: employee.workLinkTitle,
      workLinkSubtitle: employee.workLinkSubtitle,
      workLinkImageUrl: employee.workLinkImageUrl,
      workLinkk: employee.workLinkk,
      workLinkkTitle: employee.workLinkkTitle,
      workLinkkSubtitle: employee.workLinkkSubtitle,
      workLinkkImageUrl: employee.workLinkkImageUrl,
      workLinkkk: employee.workLinkkk,
      workLinkkkTitle: employee.workLinkkkTitle,
      workLinkkkSubtitle: employee.workLinkkkSubtitle,
      workLinkkkImageUrl: employee.workLinkkkImageUrl,
      workLinkkkk: employee.workLinkkkk,
      workLinkkkkTitle: employee.workLinkkkkTitle,
      workLinkkkkSubtitle: employee.workLinkkkkSubtitle,
      workLinkkkkImageUrl: employee.workLinkkkkImageUrl,
      workLinkkkkk: employee.workLinkkkkk,
      workLinkkkkkTitle: employee.workLinkkkkkTitle,
      workLinkkkkkSubtitle: employee.workLinkkkkkSubtitle,
      workLinkkkkkImageUrl: employee.workLinkkkkkImageUrl,
      googleWalletUrl: employee.googleWalletUrl,
      appleWalletUrl: employee.appleWalletUrl,
      about: employee.about,
      aboutTitle: employee.aboutTitle,
      qrCode: card.qrCode || employee.qrCode || null,
      cardUrl: employee.cardUrl || null,
      company: employee.company
        ? {
            id: employee.company.id,
            name: employee.company.name,
            email: employee.company.email,
          }
        : null,
      images: employee.images?.map((img) => img.imageUrl) || [],
    };
    return {
      message: ' تم تحميل البطاقة بنجاح',
      data: {
        design,
        employee: employeeData,
      },
    };
  }
}
