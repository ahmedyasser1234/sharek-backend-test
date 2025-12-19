import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

type ErrorResponse = {
  message?: string | string[];
  error?: string;
  errorCause?: string;
  [key: string]: unknown;
};

type LoggedRequest = Request & {
  requestId?: string;
  user?: {
    id?: string | number;
    email?: string;
    [key: string]: unknown;
  };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly errorLogPath = path.join(__dirname, '../../../logs/errors.log');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<LoggedRequest>();

    // 🔍 الحصول على معلومات الطلب
    const requestDetails = {
      method: request.method,
      url: request.originalUrl || request.url,
      requestId: request.requestId || 'N/A',
      ip: request.ip || request.connection?.remoteAddress || 'N/A',
      userAgent: request.headers['user-agent'] || 'N/A',
      userId: request.user?.id || 'غير مصرح',
      userEmail: request.user?.email || 'غير معروف',
      timestamp: new Date().toISOString(),
    };

    // 📝 الحصول على بيانات الطلب (مع التعامل مع streamed bodies)
    let requestBody = 'غير متاح';
    let queryParams = 'غير متاح';
    
    try {
      requestBody = JSON.stringify(request.body || {}, null, 2);
    } catch {
      requestBody = '[Body cannot be serialized -可能是 stream أو كبير جداً]';
    }
    
    try {
      queryParams = JSON.stringify(request.query || {}, null, 2);
    } catch {
      queryParams = '{}';
    }

    // ⚡ تحديد حالة الخطأ والرسالة
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const res =
      exception instanceof HttpException ? exception.getResponse() : null;

    const rawMessage =
      typeof res === 'object' && res !== null && 'message' in res
        ? (res as ErrorResponse).message
        : exception instanceof Error
        ? exception.message
        : 'حدث خطأ غير متوقع';

    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((m): m is string => typeof m === 'string').join(', ')
      : typeof rawMessage === 'string'
      ? rawMessage
      : 'Unknown error';

    const errorCause =
      typeof res === 'object' && res !== null && 'errorCause' in res
        ? String((res as ErrorResponse).errorCause)
        : typeof res === 'object' && res !== null && 'error' in res
        ? String((res as ErrorResponse).error)
        : exception instanceof Error && exception.message !== message
        ? exception.message
        : 'Internal Server Error';

    // 🪵 تسجيل الخطأ مع كل التفاصيل
    this.logger.error(
      `🚨 استثناء تم التقاطه [${requestDetails.requestId}]:
════════════════════════════════════════════════════════════════
📋 معلومات الطلب:
• الميثود: ${requestDetails.method}
• الرابط: ${requestDetails.url}
• الطلب ID: ${requestDetails.requestId}
• الـ IP: ${requestDetails.ip}
• المستخدم ID: ${requestDetails.userId}
• البريد: ${requestDetails.userEmail}
• الوقت: ${requestDetails.timestamp}
• الـ User Agent: ${requestDetails.userAgent}

📦 بيانات الطلب:
• Body: ${requestBody}
• Query: ${queryParams}
• Headers: ${JSON.stringify({
  authorization: request.headers.authorization ? 'Bearer ***' : 'غير موجود',
  'content-type': request.headers['content-type'] || 'غير محدد',
  accept: request.headers.accept || 'غير محدد'
}, null, 2)}

❌ تفاصيل الخطأ:
• الرسالة: ${message}
• السبب: ${errorCause}
• الحالة: ${status}
• المسار: ${exception instanceof Error ? exception.stack?.split('\n')[1]?.trim() : 'غير متوفر'}
════════════════════════════════════════════════════════════════`,
      exception instanceof Error ? exception.stack : 'No stack trace'
    );

    // 💾 محاولة حفظ اللوج في الملف
    try {
      // تأكد من وجود المجلد
      const logDir = path.dirname(this.errorLogPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // إنشاء الملف إذا لم يكن موجوداً
      if (!fs.existsSync(this.errorLogPath)) {
        fs.writeFileSync(this.errorLogPath, '', { encoding: 'utf8' });
      }

      const errorLogEntry = {
        timestamp: new Date().toISOString(),
        requestId: requestDetails.requestId,
        method: requestDetails.method,
        url: requestDetails.url,
        statusCode: status,
        userId: requestDetails.userId,
        userEmail: requestDetails.userEmail,
        ip: requestDetails.ip,
        message: message,
        errorCause: errorCause,
        requestBody: (request.body as unknown) || null,
        queryParams: (request.query as unknown) || null,
        stackTrace: exception instanceof Error ? exception.stack : null,
      };

      fs.appendFileSync(
        this.errorLogPath,
        JSON.stringify(errorLogEntry, null, 2) + ',\n',
        { encoding: 'utf8' }
      );

    } catch (fileError) {
      this.logger.warn(
        `❌ فشل في كتابة اللوج إلى الملف: ${fileError instanceof Error ? fileError.message : String(fileError)}`
      );
      
      // بديل: تسجيل في ملف مؤقت
      try {
        const tempLogPath = '/tmp/sharik-error.log';
        fs.appendFileSync(
          tempLogPath,
          `${new Date().toISOString()} - ERROR: ${message}\n`,
          { encoding: 'utf8' }
        );
      } catch {
        // آخر حل: الكونسول فقط
        console.error('🆘 خطأ حرج - تعذر تسجيل اللوج:', {
          message,
          errorCause,
          requestDetails
        });
      }
    }

    response.status(status).json({
      statusCode: status,
      success: false,
      message: message,
      errorCause: process.env.NODE_ENV === 'production' ? undefined : errorCause,
      requestId: requestDetails.requestId,
      timestamp: requestDetails.timestamp,
      path: requestDetails.url,
      data: null,
    });
  }
}