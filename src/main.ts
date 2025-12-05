import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import * as express from 'express';
import { join } from 'path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdminService } from './admin/admin.service';
import * as bodyParser from 'body-parser';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs'; 

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(AppModule);

  const uploadsPath = join(__dirname, '..', 'uploads');
  
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
    logger.log(` تم إنشاء مجلد uploads: ${uploadsPath}`);
  }
  
  app.use('/uploads', express.static(uploadsPath, {
    maxAge: '1d',
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));

  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    logger.debug(` Static file request: ${req.url}`);
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  app.enableCors({
    origin: true, 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const size = req.headers['content-length'] || '0';
    logger.verbose(`[Request Size] ${req.method} ${req.url} - ${size} bytes`);
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Employee API')
    .setDescription('توثيق كامل لنظام الموظفيين')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  logger.log(' Swagger جاهز على /docs');

  const adminService = app.get(AdminService);
  await adminService.ensureDefaultAdmin();
  logger.log(' تم التأكد من وجود الأدمن الأساسي');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  logger.log(`========================================`);
  logger.log(` Server is running on http://localhost:${port}`);
  logger.log(` Uploads available at: http://localhost:${port}/uploads/`);
  logger.log(` Example: http://localhost:${port}/uploads/bf4a8252-d955-499e-b4ef-57dfb11ff42d/images/img_1764936885928_sx7sogt.webp`);
  logger.log(` Swagger: http://localhost:${port}/docs`);
  logger.log(`========================================`);
}

void bootstrap();