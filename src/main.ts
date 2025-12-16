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

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // === 1. إضافة body-parser أولاً ===
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // === 2. ثم إضافة ValidationPipe ===
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  
  // === 3. باقي middleware ===
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // ⭐⭐ **التعديل 1: تحسين إعدادات CORS** ⭐⭐
  app.enableCors({
    origin: [
      'http://89.116.39.168',
      'http://sharik-sa.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173' // Vite dev server
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  });

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  // middleware لتسجيل حجم الطلبات
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const size = req.headers['content-length'] || '0';
    logger.verbose(`[Request Size] ${req.method} ${req.url} - ${size} bytes`);
    next();
  });

  // Swagger
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
  
  // ⭐⭐ **التعديل 2: تغيير localhost إلى 0.0.0.0** ⭐⭐
  await app.listen(port, '0.0.0.0');
  
  // ⭐⭐ **التعديل 3: تحسين رسالة التشغيل** ⭐⭐
  logger.log(`✅ Server is running on http://localhost:${port}`);
  logger.log(`🌍 Accessible externally at http://89.116.39.168:${port}`);
  logger.log(`📡 CORS enabled for: http://89.116.39.168, http://sharik-sa.com`);
}

void bootstrap();