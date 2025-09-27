import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

type ErrorResponse = {
  message?: string | string[];
  [key: string]: any;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let responseMessage: string | string[] =
      exception instanceof HttpException
        ? (exception.getResponse() as ErrorResponse).message || exception.message
        : 'Internal server error';

    if (Array.isArray(responseMessage)) {
      responseMessage = responseMessage.join(', ');
    }

    const errorLog =
      exception instanceof Error ? exception.stack || exception.message : String(exception);
    this.logger.error(`❌ استثناء تم التقاطه: ${responseMessage}`, errorLog);

    response.status(status).json({
      statusCode: status,
      success: false,
      message: responseMessage,
      data: null,
    });
  }
}
