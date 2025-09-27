import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', // أو حسب مزود الخدمة
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER, // بريدك
        pass: process.env.MAIL_PASS, // كلمة المرور أو App Password
      },
    });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: `"Digital Card" <${process.env.MAIL_USER}>`,
        to,
        subject: 'تفعيل البريد الإلكتروني',
        html: `
          <h2>مرحبًا بك 👋</h2>
          <p>اضغط على الرابط التالي لتفعيل حسابك:</p>
          <a href="${verificationUrl}" target="_blank">تفعيل الحساب</a>
        `,
      });
    } catch (err) {
      throw new InternalServerErrorException('فشل إرسال البريد الإلكتروني');
    }
  }
}
