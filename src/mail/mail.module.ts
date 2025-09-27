import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService], // عشان تقدر تستخدمه في أي موديول تاني
})
export class MailModule {}
