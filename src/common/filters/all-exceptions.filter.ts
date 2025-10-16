// src/common/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

type ErrorResponse = {
  message?: string | string[];
  error?: string;
  errorCause?: string;
  [key: string]: unknown;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

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

    this.logger.error(`استثناء تم التقاطه: ${message}`, errorCause);

    try {
      fs.appendFileSync(
        path.join(__dirname, '../../../logs/errors.log'),
        JSON.stringify({
          time: new Date().toISOString(),
          statusCode: status,
          message,
          errorCause,
        }) + '\n',
        { encoding: 'utf8' },
      );
    } catch (fileError) {
      this.logger.warn(
        'فشل في كتابة اللوج إلى الملف:',
        fileError instanceof Error ? fileError.message : String(fileError),
      );
    }

    response.status(status).json({
      statusCode: status,
      success: false,
      message,
      errorCause,
      data: null,
    });
  }
}
