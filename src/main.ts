import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ResponseLoggerInterceptor } from './common/interceptors/response-logger.interceptor';
import express, { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder, OpenAPIObject } from '@nestjs/swagger';
import { AppDataSource } from './data-source';
import { AdminService } from './admin/admin.service';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import * as fs from 'node:fs';
import * as path from 'node:path';

type LoggedRequest = Request & {
  requestId: string;
  originalUrl: string;
};

function ensureLogDirectory(): void {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logFiles = ['requests.log', 'responses.log', 'errors.log'];
  for (const file of logFiles) {
    const filePath = path.join(logsDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', { encoding: 'utf8' });
    }
  }
}

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  ensureLogDirectory();

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalInterceptors(new ResponseLoggerInterceptor());

  app.use((req: LoggedRequest, res: Response, next: NextFunction) => {
    new RequestLoggerMiddleware().use(req, res, next);
  });

  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document: OpenAPIObject = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res) as (body: unknown) => Response;

    res.json = (body: unknown): Response => {
      if (body === undefined || body === null) {
        console.warn('⚠️ محاولة إرسال undefined/null في res.json');
        return originalJson({
          statusCode: 500,
          success: false,
          message: 'Empty response body',
          errorCause: 'No content returned',
          data: null,
        });
      }

      console.log(' Response:', body);

      if (
        typeof body === 'object' &&
        body !== null &&
        'statusCode' in body &&
        typeof (body as { statusCode: unknown }).statusCode === 'number' &&
        (body as { statusCode: number }).statusCode >= 400
      ) {
        const rawMessage = (body as { message?: unknown }).message;
        const rawErrorCause = (body as { errorCause?: unknown }).errorCause;

        const message =
          typeof rawMessage === 'string'
            ? rawMessage
            : Array.isArray(rawMessage)
            ? rawMessage.filter((m): m is string => typeof m === 'string').join(' | ')
            : 'Unknown error';

        const errorCause =
          typeof rawErrorCause === 'string' ? rawErrorCause : 'No internal cause';

        console.log(` Error Cause: ${message}`);
        console.log(` Internal Cause: ${errorCause}`);
      }

      return originalJson(body);
    };

    next();
  });

  await app.init();

  const adminService: AdminService = app.get(AdminService);
  await adminService.ensureDefaultAdmin();

  const port: number = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(` Server is running on http://localhost:${port}`);
}

void bootstrap();
