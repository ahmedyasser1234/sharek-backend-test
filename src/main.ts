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
import * as https from 'https';
import * as fs from 'fs';
import * as tls from 'tls';   
import type { ServerOptions } from 'https';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const server = app.getHttpAdapter().getInstance() as express.Application;
  server.set('trust proxy', 1);

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
      'http://www.sharik-sa.com',  
      'https://www.sharik-sa.com',    
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3001',
      'http://localhost:5173',
      'https://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Forwarded-For', 'X-Real-IP']
  });

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

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

  const port = parseInt(process.env.PORT || '3000', 10);
  
  const httpsOptions: ServerOptions = {};

  httpsOptions.SNICallback = (servername: string, callback: (err: Error | null, ctx?: tls.SecureContext) => void) => {
    try {
      logger.log(` SSL requested for: ${servername}`);
      
      let keyPath: string;
      let certPath: string;

      if (servername === 'localhost' || servername === '127.0.0.1') {
        keyPath = '/etc/ssl/localhost.key';
        certPath = '/etc/ssl/localhost.crt';
        logger.log(' Using localhost certificate');
      } else {
        keyPath = '/etc/letsencrypt/live/sharik-sa.com/privkey.pem';
        certPath = '/etc/letsencrypt/live/sharik-sa.com/fullchain.pem';
        logger.log(' Using Let\'s Encrypt certificate');
      }

      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        logger.error(` Certificate files not found: ${keyPath} or ${certPath}`);
        throw new Error('Certificate files not found');
      }

      const ctx = tls.createSecureContext({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      });

      callback(null, ctx);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(` SSL Error: ${errorMessage}`);
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  };

  await app.init();
  
  const expressInstance = app.getHttpAdapter().getInstance() as express.Application;

  const httpsServer = https.createServer(httpsOptions, expressInstance);
  
  httpsServer.listen(port, '0.0.0.0', () => {
    logger.log(` Server is running on HTTPS on port ${port}`);
    logger.log(` Supports: localhost, 127.0.0.1, sharik-sa.com, www.sharik-sa.com`);
    logger.log(` Internal: https://localhost:${port}`);
    logger.log(` External: https://sharik-sa.com:${port}`);
    logger.log(` Also: https://89.116.39.168:${port}`);
  });
}

void bootstrap();