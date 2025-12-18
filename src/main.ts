// في main.ts
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

  // تفعيل trust proxy بدون NestExpressApplication
  const expressInstance = app.getHttpAdapter().getInstance() as express.Application;
  expressInstance.set('trust proxy', true);

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  app.enableCors({
    origin: [
      'http://89.116.39.168',
      'http://sharik-sa.com',
      'https://sharik-sa.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173'  
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Forwarded-For', 'X-Real-IP']
  });

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  // Middleware للتحقق من الـ IP
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const size = req.headers['content-length'] || '0';
    logger.verbose(`[Request Size] ${req.method} ${req.url} - ${size} bytes`);
    
    // لأغراض debugging
    const clientIp = req.ip;
    const xForwardedFor = Array.isArray(req.headers['x-forwarded-for']) 
      ? req.headers['x-forwarded-for'].join(', ') 
      : req.headers['x-forwarded-for'] || 'undefined';
    const xRealIp = Array.isArray(req.headers['x-real-ip']) 
      ? req.headers['x-real-ip'].join(', ') 
      : req.headers['x-real-ip'] || 'undefined';
    
    logger.debug(`[IP Debug] req.ip: ${clientIp}, x-forwarded-for: ${xForwardedFor}, x-real-ip: ${xRealIp}`);
    
    // تحقق من وجود IP حقيقي
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      logger.warn(`⚠️ Local IP detected: ${clientIp}. Nginx headers: x-forwarded-for=${xForwardedFor}, x-real-ip=${xRealIp}`);
    }
    
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
  
  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Server is running on http://localhost:${port}`);
  logger.log(`🌐 Accessible externally at http://89.116.39.168:${port}`);
  logger.log(`🔗 Accessible at https://sharik-sa.com`);
  logger.log(`✅ CORS enabled for all domains`);
  logger.log(`✅ Trust proxy enabled`);
}

void bootstrap();